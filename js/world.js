/* ==========================================================================
   The stage: a cutaway house, a long road, an office, and one person.
   Furniture is placed from the spots in day.config.js, so moving a spot
   moves the furniture that belongs to it. Everything that can change
   (lights, screens, doors, the glass of water) reads the day's "things".
   ========================================================================== */
(function () {
  "use strict";
  const B = BABYLON;
  const PI = Math.PI;
  const V3 = (x, y, z) => new B.Vector3(x, y, z);
  const FLOOR = 0.1;

  function damp(cur, target, dt, speed) {
    return cur + (target - cur) * (1 - Math.exp(-speed * dt));
  }
  function dampAngle(cur, target, dt, speed) {
    let d = ((target - cur + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI;
    return cur + d * (1 - Math.exp(-speed * dt));
  }
  function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function create(canvas, cfg, spots, rooms) {
    const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, adaptToDeviceRatio: false });
    engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));
    const scene = new B.Scene(engine);
    scene.clearColor = new B.Color4(0.1, 0.12, 0.17, 1);
    scene.ambientColor = new B.Color3(0.25, 0.25, 0.28);
    scene.fogMode = B.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.011;
    scene.skipPointerMovePicking = true;

    /* ---------------- materials ---------------- */
    const matCache = {};
    function mat(color, opt) {
      opt = opt || {};
      const key = color + JSON.stringify(opt);
      if (!opt.unique && matCache[key]) return matCache[key];
      const m = new B.StandardMaterial("m" + Object.keys(matCache).length + color, scene);
      m.diffuseColor = B.Color3.FromHexString(color);
      m.specularColor = new B.Color3(opt.spec || 0.04, opt.spec || 0.04, opt.spec || 0.04);
      m.ambientColor = m.diffuseColor.scale(0.6);
      m.maxSimultaneousLights = 10;
      if (opt.alpha != null) m.alpha = opt.alpha;
      if (opt.emissive) m.emissiveColor = B.Color3.FromHexString(opt.emissive);
      if (!opt.unique) matCache[key] = m;
      return m;
    }
    const emissiveMats = [];
    function glowMat(color, off) {
      const m = mat(color, { unique: true });
      m.disableLighting = false;
      m.emissiveColor = B.Color3.FromHexString(off || "#000000");
      emissiveMats.push(m);
      return m;
    }

    const casters = [];
    function box(name, w, h, d, x, y, z, m, parent, cast) {
      const mesh = B.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
      mesh.position.set(x, y, z);
      mesh.material = m;
      mesh.isPickable = false;
      if (parent) mesh.parent = parent;
      if (cast !== false) casters.push(mesh);
      return mesh;
    }
    function cyl(name, h, dTop, dBot, m, parent, tess) {
      const mesh = B.MeshBuilder.CreateCylinder(name, { height: h, diameterTop: dTop, diameterBottom: dBot == null ? dTop : dBot, tessellation: tess || 16 }, scene);
      mesh.material = m;
      mesh.isPickable = false;
      if (parent) mesh.parent = parent;
      casters.push(mesh);
      return mesh;
    }
    function sphere(name, d, m, parent, seg) {
      const mesh = B.MeshBuilder.CreateSphere(name, { diameter: d, segments: seg || 12 }, scene);
      mesh.material = m;
      mesh.isPickable = false;
      if (parent) mesh.parent = parent;
      casters.push(mesh);
      return mesh;
    }
    function capsule(name, h, r, m, parent) {
      const mesh = B.MeshBuilder.CreateCapsule(name, { height: h, radius: r, tessellation: 12, subdivisions: 2 }, scene);
      mesh.material = m;
      mesh.isPickable = false;
      if (parent) mesh.parent = parent;
      casters.push(mesh);
      return mesh;
    }

    /* A node placed at a spot, rotated to its facing. +z in the node = the way the person faces. */
    function anchor(spotName, fwd, right, extraYaw) {
      const s = spots[spotName];
      if (!s) return null;
      const n = new B.TransformNode("at-" + spotName, scene);
      const f = { x: Math.sin(s.face), z: Math.cos(s.face) };
      const r = { x: Math.cos(s.face), z: -Math.sin(s.face) };
      n.position.set(s.x + f.x * (fwd || 0) + r.x * (right || 0), 0, s.z + f.z * (fwd || 0) + r.z * (right || 0));
      n.rotation.y = s.face + (extraYaw || 0);
      return n;
    }

    /* ---------------- lights, camera, post ---------------- */
    const camera = new B.ArcRotateCamera("cam", 1.3, 1.05, 9, V3(0, 1, 0), scene);
    camera.lowerRadiusLimit = 2.5;
    camera.upperRadiusLimit = 60;
    camera.lowerBetaLimit = 0.35;
    camera.upperBetaLimit = 1.42;
    camera.wheelDeltaPercentage = 0.012; // zoom in proportion to distance; smooth on trackpads
    camera.pinchPrecision = 60;
    camera.panningSensibility = 0;
    camera.minZ = 0.1;
    camera.maxZ = 600;
    camera.fov = 0.78;
    camera.attachControl(canvas, false); // false = the camera takes the wheel/pinch, the page doesn't

    const hemi = new B.HemisphericLight("sky", V3(0.1, 1, 0.3), scene);
    hemi.groundColor = new B.Color3(0.2, 0.18, 0.16);
    const sun = new B.DirectionalLight("sun", V3(-0.4, -1, -0.5), scene);
    sun.position = V3(20, 40, 20);
    sun.shadowFrustumSize = 30;
    sun.autoCalcShadowZBounds = true;
    const shadows = new B.ShadowGenerator(2048, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.filteringQuality = B.ShadowGenerator.QUALITY_MEDIUM;
    shadows.bias = 0.0015;
    shadows.normalBias = 0.02;
    shadows.darkness = 0.25;

    const glow = new B.GlowLayer("glow", scene, { mainTextureSamples: 2, blurKernelSize: 48 });
    glow.intensity = 0.75;
    const glowing = (mesh) => {
      glow.addIncludedOnlyMesh(mesh);
      return mesh;
    };

    const pipeline = new B.DefaultRenderingPipeline("look", true, scene, [camera]);
    pipeline.fxaaEnabled = true;
    pipeline.samples = 4;
    pipeline.imageProcessing.toneMappingEnabled = true;
    pipeline.imageProcessing.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
    pipeline.imageProcessing.exposure = 1.1;
    pipeline.imageProcessing.contrast = 1.12;
    pipeline.imageProcessing.vignetteEnabled = true;
    pipeline.imageProcessing.vignetteWeight = 1.6;
    pipeline.imageProcessing.vignetteColor = new B.Color4(0.05, 0.05, 0.08, 0);

    /* ---------------- ground, street ---------------- */
    const street = cfg.street || { z: 12.6, from: -80, to: 2500, signals: [] };
    const RZ = street.z;
    const groundLen = street.to - street.from + 200;
    const ground = B.MeshBuilder.CreateGround("ground", { width: groundLen, height: 160 }, scene);
    ground.position.set((street.from + street.to) / 2, 0, 10);
    ground.material = mat("#4a6b4c");
    ground.receiveShadows = true;
    ground.isPickable = false;
    const road = box("road", street.to - street.from, 0.04, 4.4, (street.from + street.to) / 2, 0.02, RZ, mat("#3b3e44"), null, false);
    road.receiveShadows = true;
    const curbM = mat("#b9b3a8");
    box("walkS", street.to - street.from, 0.06, 1.2, (street.from + street.to) / 2, 0.03, RZ - 2.9, curbM, null, false).receiveShadows = true;
    box("walkN", street.to - street.from, 0.06, 1.2, (street.from + street.to) / 2, 0.03, RZ + 2.9, curbM, null, false).receiveShadows = true;
    const dash = box("dash", 1.6, 0.012, 0.12, 0, 0.05, RZ, mat("#e8e1cf", { emissive: "#2a281f" }), null, false);
    for (let x = street.from; x < street.to; x += 6) dash.thinInstanceAdd(B.Matrix.Translation(x, 0, 0));

    const rng = makeRng(20261013);

    /* Driveway at home + work lot */
    const ph = spots.parkHome;
    if (ph) box("driveway", 3.2, 0.03, RZ - 2.2 - 4.7, ph.x, 0.025, (4.7 + RZ - 2.2) / 2, mat("#6f6a62"), null, false).receiveShadows = true;
    const pw = spots.parkWork;
    const officeO = (cfg.buildings.office && cfg.buildings.office.origin) || [2400, 0];
    if (pw) {
      const lot = box("lot", 20, 0.03, RZ - 2.2 - 4.7, officeO[0] + 9, 0.025, (4.7 + RZ - 2.2) / 2, mat("#4a4d52"), null, false);
      lot.receiveShadows = true;
      const lineM = mat("#dcd6c8");
      for (let i = -3; i <= 4; i++) box("pline" + i, 0.08, 0.012, 4.2, pw.x + i * 2.6 - 1.3, 0.05, 7.8, lineM, null, false);
    }

    /* Street furniture: lamps, trees, houses, shops */
    const poleM = mat("#3a3d42");
    const lampHeadM = glowMat("#fff1c9");
    const pole = cyl("pole", 4.2, 0.1, 0.14, poleM, null, 8);
    pole.position.y = 2.1;
    pole.bakeCurrentTransformIntoVertices();
    const lampHead = box("lamphead", 0.5, 0.12, 0.3, 0, 4.25, 0.35, lampHeadM, null, false);
    lampHead.bakeCurrentTransformIntoVertices();
    glowing(lampHead);
    for (let x = street.from + 10; x < street.to; x += 32) {
      [RZ - 3.4, RZ + 3.4].forEach((z, i) => {
        if (Math.abs(x - (ph ? ph.x : 0)) < 4 || Math.abs(x - (pw ? pw.x : 0)) < 12) return;
        const m = B.Matrix.Compose(B.Vector3.One(), B.Quaternion.FromEulerAngles(0, i ? PI : 0, 0), V3(x, 0, z));
        pole.thinInstanceAdd(m);
        lampHead.thinInstanceAdd(m);
      });
    }

    const trunkM = mat("#6a4e38");
    const leafMs = ["#3f6e48", "#4a7a45", "#36603f", "#5b7f3e"].map((c) => mat(c));
    const trunk = cyl("trunk", 1.6, 0.16, 0.24, trunkM, null, 7);
    trunk.position.y = 0.8;
    trunk.bakeCurrentTransformIntoVertices();
    const crowns = leafMs.map((m, i) => {
      const c = sphere("crown" + i, 2.2, m, null, 7);
      c.position.y = 2.3;
      c.bakeCurrentTransformIntoVertices();
      return c;
    });
    function tree(x, z, s) {
      const k = Math.floor(rng() * crowns.length);
      trunk.thinInstanceAdd(B.Matrix.Compose(V3(s, s, s), B.Quaternion.Identity(), V3(x, 0, z)));
      crowns[k].thinInstanceAdd(B.Matrix.Compose(V3(s * (0.9 + rng() * 0.3), s * (0.8 + rng() * 0.4), s * (0.9 + rng() * 0.3)), B.Quaternion.Identity(), V3(x, 0, z)));
    }

    const houseMs = ["#d9cbb5", "#c8d2d6", "#e2d5c9", "#bfc9b7", "#d6bfa9"].map((c) => mat(c));
    const roofMs = ["#7a4d42", "#55606b", "#6b5a4a"].map((c) => mat(c));
    const houseBody = houseMs.map((m, i) => {
      const b = box("hb" + i, 1, 1, 1, 0, 0.5, 0, m, null, false);
      b.bakeCurrentTransformIntoVertices();
      return b;
    });
    const roofs = roofMs.map((m, i) => {
      const r = B.MeshBuilder.CreateCylinder("roof" + i, { height: 1, diameter: 1, tessellation: 3 }, scene);
      r.material = m;
      r.isPickable = false;
      r.rotation.z = PI / 2;
      r.bakeCurrentTransformIntoVertices();
      return r;
    });
    const winM = glowMat("#2b3340");
    const houseWin = box("hwin", 1, 1, 0.04, 0, 0, 0, winM, null, false);
    glowing(houseWin);
    function house(x, z, w, d, h, facing) {
      const k = Math.floor(rng() * houseBody.length);
      houseBody[k].thinInstanceAdd(B.Matrix.Compose(V3(w, h, d), B.Quaternion.Identity(), V3(x, 0, z)));
      const rk = Math.floor(rng() * roofs.length);
      const ry = d * 0.45;
      roofs[rk].thinInstanceAdd(B.Matrix.Compose(V3(w * 1.06, ry, d * 1.12), B.Quaternion.Identity(), V3(x, h + 0.25 * ry, z)));
      const fz = z + (facing > 0 ? d / 2 + 0.03 : -d / 2 - 0.03);
      for (let i = 0; i < 2; i++) {
        const wx = x - w / 4 + (i * w) / 2;
        houseWin.thinInstanceAdd(B.Matrix.Compose(V3(0.9, 0.8, 1), B.Quaternion.Identity(), V3(wx, h * 0.55, fz)));
      }
    }
    const shopMs = ["#9aa3ab", "#b8ab98", "#8e98a3", "#c2b8a6", "#a3968a"].map((c) => mat(c));
    const shopBodies = shopMs.map((m, i) => {
      const b = box("sb" + i, 1, 1, 1, 0, 0.5, 0, m, null, false);
      b.bakeCurrentTransformIntoVertices();
      return b;
    });
    function shop(x, z, w, d, h, facing) {
      const k = Math.floor(rng() * shopBodies.length);
      shopBodies[k].thinInstanceAdd(B.Matrix.Compose(V3(w, h, d), B.Quaternion.Identity(), V3(x, 0, z)));
      const fz = z + (facing > 0 ? d / 2 + 0.03 : -d / 2 - 0.03);
      const floors = Math.max(1, Math.floor(h / 3));
      for (let f = 0; f < floors; f++) {
        for (let i = 0; i < Math.max(1, Math.floor(w / 3)); i++) {
          const wx = x - w / 2 + 1.5 + i * 3;
          if (rng() < 0.75) houseWin.thinInstanceAdd(B.Matrix.Compose(V3(1.6, 1.1, 1), B.Quaternion.Identity(), V3(wx, 1.6 + f * 3, fz)));
        }
      }
    }
    const homeB = cfg.buildings.home && cfg.buildings.home.bounds;
    const signalX = (street.signals || []).map((s) => s.x);
    function nearKeepout(x, z) {
      if (homeB && x > homeB[0] - 6 && x < homeB[2] + 6 && z < RZ) return true;
      if (x > officeO[0] - 8 && x < officeO[0] + 26 && z < RZ) return true;
      if (signalX.some((sx) => Math.abs(sx - x) < 8)) return true;
      return false;
    }
    for (let x = street.from + 4; x < street.to; x += 13 + rng() * 10) {
      const neighborhood = x < (signalX[0] || 500) + 60;
      [-1, 1].forEach((side) => {
        const z = side < 0 ? RZ - 11 - rng() * 3 : RZ + 11 + rng() * 3;
        if (nearKeepout(x, z)) return;
        if (neighborhood) {
          if (rng() < 0.82) house(x, z, 7 + rng() * 3, 6 + rng() * 2, 2.6 + rng() * 0.8, side < 0 ? 1 : -1);
        } else if (rng() < 0.7) {
          shop(x, z + side * 3, 9 + rng() * 8, 8 + rng() * 6, 3 + rng() * 12, side < 0 ? 1 : -1);
        }
      });
    }
    for (let x = street.from; x < street.to; x += 4 + rng() * 9) {
      [-1, 1].forEach((side) => {
        if (rng() < 0.45) return;
        const z = side < 0 ? RZ - 5 - rng() * 2.5 : RZ + 5 + rng() * 3;
        if (nearKeepout(x, z)) return;
        tree(x, z, 0.8 + rng() * 0.7);
      });
    }
    [[-12, 3], [-9, -6], [14, 1], [15, -5], [officeO[0] - 5, 1], [officeO[0] + 23, -2], [officeO[0] + 22, 4]].forEach((p) => tree(p[0], p[1], 1.1 + rng() * 0.4));

    /* Traffic signals */
    const signalLamps = [];
    (street.signals || []).forEach((sg, i) => {
      [RZ - 2.6, RZ + 2.6].forEach((z, j) => {
        const p = cyl("sigpole" + i + j, 3.2, 0.1, 0.12, poleM, null, 8);
        p.position.set(sg.x + (j ? 4 : -4), 1.6, z);
        const head = box("sighead" + i + j, 0.32, 0.9, 0.3, sg.x + (j ? 4 : -4), 3.0, z, mat("#222428"));
        head.rotation.y = j ? PI / 2 : -PI / 2;
        const red = glowMat("#c43a32");
        const green = glowMat("#39b56a");
        const r = sphere("sigr" + i + j, 0.2, red, head, 8);
        r.position.set(0, 0.22, 0.16);
        const g = sphere("sigg" + i + j, 0.2, green, head, 8);
        g.position.set(0, -0.22, 0.16);
        glowing(r);
        glowing(g);
        signalLamps.push({ thing: sg.thing || "signal", red, green });
      });
    });

    /* ---------------- buildings ---------------- */
    const roomLights = [];
    const windows = [];
    const buildingMeshes = {};
    function trackMeshes(bid, fn) {
      const before = scene.meshes.length;
      fn();
      buildingMeshes[bid] = (buildingMeshes[bid] || []).concat(scene.meshes.slice(before));
    }

    function windowPane(x, z, w, y, h, rotY) {
      const frameM = mat("#f3efe6");
      const n = new B.TransformNode("win", scene);
      n.position.set(x, 0, z);
      n.rotation.y = rotY || 0;
      box("wt", w + 0.14, 0.08, 0.1, 0, y + h / 2, 0, frameM, n);
      box("wb", w + 0.2, 0.08, 0.16, 0, y - h / 2, 0.03, frameM, n);
      box("wl", 0.08, h, 0.1, -w / 2, y, 0, frameM, n);
      box("wr", 0.08, h, 0.1, w / 2, y, 0, frameM, n);
      box("wm", 0.04, h, 0.06, 0, y, 0, frameM, n);
      const gm = mat("#cfe3f0", { unique: true });
      gm.emissiveColor = new B.Color3(0.4, 0.55, 0.7);
      const g = box("wg", w, h, 0.02, 0, y, 0, gm, n, false);
      windows.push(g);
      return g;
    }

    Object.entries(cfg.buildings || {}).forEach(([bid, b]) => {
      if (!b.bounds) return;
      trackMeshes(bid, () => {
        const o = b.origin || [0, 0];
        const [x0, z0, x1, z1] = [b.bounds[0] + o[0], b.bounds[1] + o[1], b.bounds[2] + o[0], b.bounds[3] + o[1]];
        const W = x1 - x0;
        const D = z1 - z0;
        const H = 2.75;
        const wallM = mat(b.wall || "#e6dfd2");
        const outM = mat("#c9bfb0");
        const floorM = mat(b.floor || "#c6aa7c");
        const fl = box(bid + "-floor", W, 0.1, D, x0 + W / 2, FLOOR / 2, z0 + D / 2, floorM, null, false);
        fl.receiveShadows = true;
        box(bid + "-plinth", W + 0.4, 0.1, D + 0.4, x0 + W / 2, 0.03, z0 + D / 2, outM, null, false).receiveShadows = true;
        const back = box(bid + "-back", W, H, 0.16, x0 + W / 2, H / 2, z0, wallM);
        back.receiveShadows = true;
        const left = box(bid + "-left", 0.16, H, D, x0, H / 2, z0 + D / 2, wallM);
        left.receiveShadows = true;
        const right = box(bid + "-right", 0.16, H, D, x1, H / 2, z0 + D / 2, wallM);
        right.receiveShadows = true;
        const trimM = mat(bid === "office" ? "#59636e" : "#8d5a45");
        box(bid + "-crown", W + 0.3, 0.14, 0.3, x0 + W / 2, H + 0.07, z0, trimM);
        box(bid + "-crownL", 0.3, 0.14, D, x0, H + 0.07, z0 + D / 2, trimM);
        box(bid + "-crownR", 0.3, 0.14, D, x1, H + 0.07, z0 + D / 2, trimM);
        box(bid + "-base", W, 0.12, 0.05, x0 + W / 2, FLOOR + 0.06, z0 + 0.1, trimM, null, false);
        (b.walls || []).forEach((w, i) => {
          const glass = w[4] === "glass";
          const wx0 = w[0] + o[0];
          const wz0 = w[1] + o[1];
          const wx1 = w[2] + o[0];
          const wz1 = w[3] + o[1];
          const len = Math.hypot(wx1 - wx0, wz1 - wz0);
          const m = glass ? mat("#bcd3df", { alpha: 0.22, spec: 0.6 }) : wallM;
          const wallH = glass ? 2.4 : 2.45;
          const mesh = box(bid + "-wall" + i, len, wallH, glass ? 0.04 : 0.12, (wx0 + wx1) / 2, wallH / 2 + FLOOR, (wz0 + wz1) / 2, m, null, !glass);
          mesh.rotation.y = -Math.atan2(wz1 - wz0, wx1 - wx0);
          mesh.receiveShadows = !glass;
          if (glass) {
            const fm = mat("#59636e");
            const top = box(bid + "-wallt" + i, len, 0.06, 0.08, (wx0 + wx1) / 2, wallH + FLOOR, (wz0 + wz1) / 2, fm);
            top.rotation.y = mesh.rotation.y;
          }
        });
      });
    });

    /* Room floors, back-wall windows and ceiling lights */
    Object.values(rooms).forEach((r) => {
      if (!r.area || r.building === "street") return;
      const bd = cfg.buildings[r.building];
      if (!bd || !bd.bounds) return;
      trackMeshes(r.building, () => {
        const [ax0, az0, ax1, az1] = r.area;
        const o = bd.origin || [0, 0];
        const inside = az1 <= bd.bounds[3] + o[1] + 0.01;
        if (r.floor && inside) {
          const f = box("floor-" + r.id, ax1 - ax0 - 0.04, 0.012, az1 - az0 - 0.04, (ax0 + ax1) / 2, FLOOR + 0.006, (az0 + az1) / 2, mat(r.floor), null, false);
          f.receiveShadows = true;
        }
        if (inside && Math.abs(az0 - (bd.bounds[1] + o[1])) < 0.01 && ax1 - ax0 > 2.2) {
          windowPane((ax0 + ax1) / 2 + (r.id === "living" ? -1.6 : 0), az0 + 0.1, Math.min(1.6, (ax1 - ax0) * 0.35), 1.75, 1.1);
        }
      });
      if (r.light) {
        const cx = (r.area[0] + r.area[2]) / 2;
        const cz = Math.min((r.area[1] + r.area[3]) / 2, (bd.bounds[3] + (bd.origin || [0, 0])[1]) - 1);
        const L = new B.PointLight("light-" + r.id, V3(cx, 2.35, cz), scene);
        L.diffuse = B.Color3.FromHexString("#ffd9a8");
        L.specular = new B.Color3(0.1, 0.08, 0.05);
        L.intensity = 0;
        L.range = 9;
        roomLights.push({ light: L, thing: r.light, building: r.building, level: 0 });
      }
    });
    const officeLights = [];
    if (cfg.buildings.office && cfg.buildings.office.bounds) {
      const o = cfg.buildings.office.origin;
      [[6, -1.2], [12, -1.2], [9, 3]].forEach((p, i) => {
        const L = new B.PointLight("office" + i, V3(o[0] + p[0], 2.5, o[1] + p[1]), scene);
        L.diffuse = B.Color3.FromHexString("#eef3ff");
        L.intensity = 0;
        L.range = 11;
        officeLights.push(L);
      });
    }

    /* ---------------- furniture ---------------- */
    const wood = mat("#8d6844");
    const woodDark = mat("#6b4c33");
    const woodLight = mat("#b48a5c");
    const linen = mat("#ece6da");
    const white = mat("#f2efe8", { spec: 0.2 });
    const metal = mat("#9aa1a8", { spec: 0.5 });
    const dark = mat("#2a2d33");
    const props = {};

    function chair(spotName, color) {
      const n = anchor(spotName, 0, 0);
      if (!n) return null;
      const m = color ? mat(color) : wood;
      box("seat", 0.48, 0.07, 0.46, 0, 0.5, -0.05, m, n);
      box("back", 0.48, 0.55, 0.06, 0, 0.8, -0.3, m, n);
      [[-0.2, 0.15], [0.2, 0.15], [-0.2, -0.25], [0.2, -0.25]].forEach((p, i) => box("leg" + i, 0.05, 0.46, 0.05, p[0], 0.27, p[1], m, n));
      return n;
    }
    function desk(spotName, opts) {
      const n = anchor(spotName, 0.62, 0);
      if (!n) return null;
      box("top", opts.w || 1.4, 0.06, 0.7, 0, 0.82, 0, opts.m || wood, n);
      box("legL", 0.06, 0.74, 0.6, -(opts.w || 1.4) / 2 + 0.06, 0.45, 0, opts.m || wood, n);
      box("legR", 0.06, 0.74, 0.6, (opts.w || 1.4) / 2 - 0.06, 0.45, 0, opts.m || wood, n);
      if (opts.screen) {
        box("stand", 0.08, 0.25, 0.08, 0, 0.98, 0.18, dark, n);
        const sm = glowMat("#14181f");
        const scr = box("screen", 0.72, 0.42, 0.04, 0, 1.25, 0.2, dark, n);
        const face = box("screenface", 0.66, 0.37, 0.01, 0, 1.25, 0.177, sm, n, false);
        glowing(face);
        box("kbd", 0.45, 0.02, 0.15, 0, 0.86, -0.12, mat("#3a3e46"), n);
        scr.receiveShadows = true;
        return { node: n, screen: sm };
      }
      return { node: n };
    }

    /* Bedroom */
    let quiltUp = null;
    let quiltDown = null;
    let alarmFace = null;
    let bedLampShade = null;
    let nightPhone = null;
    if (spots.bed) {
      const n = anchor("bed", 0, 0);
      box("bedframe", 1.75, 0.32, 2.2, 0, 0.26, -0.25, wood, n);
      box("mattress", 1.6, 0.2, 2.05, 0, 0.52, -0.25, linen, n).receiveShadows = true;
      box("headboard", 1.75, 1.0, 0.1, 0, 0.6, -1.33, woodDark, n);
      box("pillow", 0.65, 0.13, 0.36, -0.3, 0.68, -1.0, white, n);
      box("pillow2", 0.65, 0.13, 0.36, 0.38, 0.68, -1.02, white, n);
      quiltUp = box("quilt", 1.66, 0.12, 1.62, 0, 0.9, 0.36, mat("#3d4f68"), n);
      quiltDown = box("quiltdown", 1.66, 0.14, 0.45, 0, 0.66, 0.66, mat("#3d4f68"), n);
      box("bedrug", 2.6, 0.015, 1.4, 0, FLOOR + 0.008, 1.3, mat("#8d4e45"), n, false).receiveShadows = true;
      const ns = new B.TransformNode("ns", scene);
      ns.parent = n;
      ns.position.set(-1.25, 0, -1.0);
      box("nstand", 0.48, 0.55, 0.42, 0, 0.32, 0, woodLight, ns);
      const am = glowMat("#1c1f22");
      alarmFace = am;
      box("clock", 0.2, 0.1, 0.1, 0.08, 0.65, 0.05, dark, ns);
      glowing(box("clockface", 0.16, 0.06, 0.01, 0.08, 0.65, 0.105, am, ns, false));
      cyl("lampbase", 0.3, 0.05, 0.12, metal, ns, 12).position.set(-0.12, 0.75, -0.05);
      const shadeM = glowMat("#f0d7a4");
      bedLampShade = shadeM;
      const shade = cyl("lampshade", 0.22, 0.18, 0.28, shadeM, ns, 18);
      shade.position.set(-0.12, 0.98, -0.05);
      glowing(shade);
      nightPhone = box("nphone", 0.08, 0.015, 0.15, 0.1, 0.6, -0.12, dark, ns);
      const tvN = anchor("bed", 2.95, 0, PI);
      if (tvN) {
        box("dresser", 1.2, 0.75, 0.45, 0, 0.42, 0, woodLight, tvN);
        const sm = glowMat("#111418");
        box("btv", 0.95, 0.56, 0.05, 0, 1.12, 0.05, dark, tvN);
        glowing(box("btvface", 0.88, 0.5, 0.01, 0, 1.12, 0.08, sm, tvN, false));
        props.bedTv = sm;
      }
    }

    /* Bathroom */
    if (spots.toilet) {
      const n = anchor("toilet", 0, 0);
      cyl("bowl", 0.4, 0.42, 0.3, white, n, 16).position.set(0, 0.3, 0.1);
      box("tank", 0.42, 0.45, 0.2, 0, 0.72, -0.22, white, n);
      box("tseat", 0.42, 0.04, 0.46, 0, 0.51, 0.08, white, n);
      box("tpaper", 0.12, 0.12, 0.12, 0.4, 0.75, 0.05, linen, n);
    }
    let showerWater = null;
    if (spots.shower) {
      const n = anchor("shower", 0, 0);
      box("tray", 1.3, 0.08, 1.3, 0, FLOOR + 0.04, 0, white, n, false).receiveShadows = true;
      box("sglass", 0.03, 2.0, 1.3, 0.65, 1.1, 0, mat("#cfe6ef", { alpha: 0.25, spec: 0.8 }), n, false);
      box("sglass2", 1.3, 2.0, 0.03, 0, 1.1, -0.65, mat("#cfe6ef", { alpha: 0.18, spec: 0.8 }), n, false);
      cyl("spipe", 0.9, 0.04, 0.04, metal, n, 8).position.set(-0.55, 1.75, 0);
      const head = cyl("shead", 0.05, 0.22, 0.22, metal, n, 16);
      head.position.set(-0.4, 2.2, 0);
      const ps = new B.ParticleSystem("water", 900, scene);
      ps.particleTexture = dotTexture();
      ps.emitter = head;
      ps.minEmitBox = V3(-0.08, 0, -0.08);
      ps.maxEmitBox = V3(0.08, 0, 0.08);
      ps.direction1 = V3(-0.05, -1, -0.05);
      ps.direction2 = V3(0.05, -1, 0.05);
      ps.gravity = V3(0, -9, 0);
      ps.minSize = 0.02;
      ps.maxSize = 0.045;
      ps.minLifeTime = 0.18;
      ps.maxLifeTime = 0.26;
      ps.emitRate = 600;
      ps.minEmitPower = 1;
      ps.maxEmitPower = 2;
      ps.color1 = new B.Color4(0.75, 0.88, 1, 0.55);
      ps.color2 = new B.Color4(0.85, 0.95, 1, 0.35);
      ps.colorDead = new B.Color4(1, 1, 1, 0);
      ps.blendMode = B.ParticleSystem.BLENDMODE_ADD;
      showerWater = ps;
    }
    function sink(spotName, cabinetColor) {
      const n = anchor(spotName, 0.25, 0);
      if (!n) return;
      box("vanity", 0.9, 0.8, 0.4, 0, 0.5, 0, mat(cabinetColor || "#efe6d6"), n);
      box("basin", 0.5, 0.06, 0.3, 0, 0.92, -0.02, white, n);
      cyl("tap", 0.2, 0.03, 0.03, metal, n, 8).position.set(0, 1.0, 0.14);
      const mir = box("mirror", 0.7, 0.8, 0.02, 0, 1.6, 0.17, mat("#cfdde6", { spec: 1 }), n, false);
      mir.material.emissiveColor = new B.Color3(0.12, 0.14, 0.16);
    }
    sink("sinkHome");
    sink("sinkW", "#c9ced4");
    if (spots.bathCenter) {
      const n = anchor("bathCenter", -0.9, 1.0);
      box("towelbar", 0.6, 0.03, 0.03, 0, 1.2, 0, metal, n);
      box("towel", 0.5, 0.6, 0.04, 0, 0.92, 0.01, mat("#a8c6c2"), n);
    }
    if (spots.toiletW) {
      const n = anchor("toiletW", 0, 0);
      cyl("bowlW", 0.4, 0.42, 0.3, white, n, 16).position.set(0, 0.3, 0.1);
      box("tankW", 0.42, 0.45, 0.2, 0, 0.72, -0.22, white, n);
      box("stall", 0.05, 1.8, 1.6, 0.75, 1.0, 0.2, mat("#8b98a5"), n);
    }

    /* Living room */
    if (spots.couch) {
      const n = anchor("couch", 0, 0);
      const cm = mat("#7a5a49");
      const cm2 = mat("#6a4c3d");
      box("couchbase", 2.3, 0.4, 0.9, 0, 0.3, -0.12, cm2, n);
      box("cushion1", 1.08, 0.14, 0.8, -0.56, 0.55, -0.1, cm, n);
      box("cushion2", 1.08, 0.14, 0.8, 0.56, 0.55, -0.1, cm, n);
      box("couchback", 2.3, 0.62, 0.22, 0, 0.8, -0.5, cm2, n);
      box("armL", 0.2, 0.55, 0.9, -1.15, 0.5, -0.12, cm2, n);
      box("armR", 0.2, 0.55, 0.9, 1.15, 0.5, -0.12, cm2, n);
      box("throwpillow", 0.38, 0.32, 0.12, 0.8, 0.75, -0.35, mat("#c9a04f"), n);
      box("rugL", 3.4, 0.015, 2.6, 0, FLOOR + 0.008, 1.4, mat("#6e5a48"), n, false).receiveShadows = true;
      box("ctable", 1.0, 0.06, 0.55, 0, 0.45, 1.3, woodLight, n);
      [[-0.45, 1.1], [0.45, 1.1], [-0.45, 1.5], [0.45, 1.5]].forEach((p, i) => box("ctl" + i, 0.05, 0.4, 0.05, p[0], 0.23, p[1], woodLight, n));
      const remote = box("remote", 0.05, 0.02, 0.18, 0.3, 0.49, 1.25, dark, n);
      props.remote = remote;
      const tvN = anchor("couch", 4.05, 0, PI);
      if (tvN) {
        box("tvstand", 1.8, 0.45, 0.42, 0, 0.32, 0, woodDark, tvN);
        const sm = glowMat("#0f1216");
        box("tv", 1.55, 0.88, 0.06, 0, 1.25, 0.06, dark, tvN);
        glowing(box("tvface", 1.48, 0.82, 0.01, 0, 1.25, 0.095, sm, tvN, false));
        props.tv = sm;
        box("plantpot", 0.3, 0.35, 0.3, 1.25, 0.28, 0.0, mat("#a0644c"), tvN);
        sphere("plant", 0.6, leafMs[0], tvN, 8).position.set(1.25, 0.75, 0);
      }
      const lampN = anchor("couch", -0.2, -1.6);
      if (lampN) {
        cyl("flpole", 1.5, 0.04, 0.04, metal, lampN, 8).position.y = 0.85;
        const sm = glowMat("#f0d7a4");
        const sh = cyl("flshade", 0.3, 0.3, 0.42, sm, lampN, 18);
        sh.position.y = 1.65;
        glowing(sh);
        props.floorLamp = sm;
      }
    }
    if (spots.pcChair) {
      chair("pcChair", "#4a4f5a");
      const d = desk("pcChair", { w: 1.25, screen: true });
      props.pc = d && d.screen;
      const shelf = anchor("pcChair", 0.95, 1.0);
      if (shelf) {
        box("shelf", 0.8, 1.6, 0.3, 0, 0.9, 0, woodDark, shelf);
        ["#b5523f", "#3e6b8a", "#c9a04f", "#557a55"].forEach((c, i) => box("book" + i, 0.12, 0.3, 0.22, -0.25 + i * 0.15, 1.35, 0, mat(c), shelf));
      }
    }
    let frontDoorNode = null;
    if (spots.frontDoorIn && spots.frontDoorOut) {
      const x = (spots.frontDoorIn.x + spots.frontDoorOut.x) / 2;
      const z = homeB ? homeB[3] : (spots.frontDoorIn.z + spots.frontDoorOut.z) / 2;
      const fm = mat("#8d5a45");
      box("dframeL", 0.12, 2.3, 0.18, x - 0.5, 1.2, z, fm);
      box("dframeR", 0.12, 2.3, 0.18, x + 0.5, 1.2, z, fm);
      box("dframeT", 1.12, 0.14, 0.18, x, 2.35, z, fm);
      const hinge = new B.TransformNode("hinge", scene);
      hinge.position.set(x - 0.44, 0, z);
      box("door", 0.88, 2.2, 0.06, 0.44, 1.15, 0, mat("#5b7c8a"), hinge);
      sphere("knob", 0.07, metal, hinge, 8).position.set(0.78, 1.1, 0.05);
      frontDoorNode = hinge;
      box("step", 1.4, 0.12, 0.6, x, 0.06, z + 0.45, mat("#a39a8c"), null, false);
      box("doormat", 0.9, 0.02, 0.5, x, FLOOR + 0.01, z - 0.45, mat("#7a6a55"), null, false);
    }
    if (spots.entryTable) {
      const n = anchor("entryTable", 0.42, 0);
      box("etable", 0.9, 0.05, 0.35, 0, 0.82, 0, woodLight, n);
      box("etleg", 0.85, 0.78, 0.3, 0, 0.41, 0, woodDark, n);
      cyl("keybowl", 0.05, 0.22, 0.16, mat("#c9a04f"), n, 16).position.set(0.2, 0.87, 0);
      props.bag = box("bagEntry", 0.4, 0.3, 0.15, -0.25, 0.99, 0, mat("#5a4636"), n);
    }
    if (spots.thermostat) {
      const n = anchor("thermostat", 0.35, 0);
      box("thermo", 0.12, 0.16, 0.03, 0, 1.45, 0, white, n);
    }
    if (spots.mailbox) {
      const n = anchor("mailbox", 0.4, 0);
      cyl("mpost", 1.1, 0.08, 0.08, woodDark, n, 8).position.y = 0.55;
      box("mbox", 0.25, 0.25, 0.45, 0, 1.2, 0, mat("#3b4a5a"), n);
    }

    /* Kitchen */
    let fridgeDoor = null;
    let fridgeLight = null;
    if (spots.fridge) {
      const n = anchor("fridge", 0.78, 0);
      box("fridge", 0.82, 1.9, 0.7, 0, 1.0, 0, mat("#e9ecee", { spec: 0.4 }), n);
      const fl = glowMat("#cfd6da");
      fridgeLight = fl;
      box("fridgeIn", 0.72, 1.75, 0.02, 0, 1.0, -0.33, fl, n, false);
      const hinge = new B.TransformNode("fhinge", scene);
      hinge.parent = n;
      hinge.position.set(0.41, 0, -0.36);
      box("fdoor", 0.82, 1.88, 0.06, -0.41, 1.0, 0, mat("#e2e6e8", { spec: 0.4 }), hinge);
      box("fhandle", 0.04, 0.5, 0.05, -0.75, 1.2, -0.05, metal, hinge);
      fridgeDoor = hinge;
    }
    let burner = null;
    let steam = null;
    let microwaveLight = null;
    let sinkMug = null;
    let shelfMug = null;
    const counterSpots = ["stove", "kitchenSink", "counter"].filter((s) => spots[s]);
    counterSpots.forEach((sn) => {
      const n = anchor(sn, 0.72, 0);
      box("cab-" + sn, 1.1, 0.86, 0.62, 0, 0.5, 0, mat("#efe6d6"), n);
      box("ctop-" + sn, 1.12, 0.05, 0.66, 0, 0.95, 0, mat("#4a4440", { spec: 0.3 }), n);
      box("upper-" + sn, 1.1, 0.7, 0.36, 0, 1.95, 0.15, mat("#efe6d6"), n);
      if (sn === "stove") {
        const bm = glowMat("#2b2b2b");
        burner = bm;
        glowing(cyl("burner", 0.02, 0.26, 0.26, bm, n, 20)).position.set(-0.2, 0.985, 0);
        cyl("burner2", 0.02, 0.22, 0.22, dark, n, 20).position.set(0.25, 0.985, 0.1);
        const pan = cyl("pan", 0.07, 0.32, 0.28, dark, n, 20);
        pan.position.set(-0.2, 1.03, 0);
        box("panhandle", 0.04, 0.03, 0.3, -0.2, 1.05, -0.3, dark, n);
        const ps = new B.ParticleSystem("steam", 160, scene);
        ps.particleTexture = dotTexture();
        ps.emitter = pan;
        ps.minEmitBox = V3(-0.1, 0.05, -0.1);
        ps.maxEmitBox = V3(0.1, 0.05, 0.1);
        ps.direction1 = V3(-0.1, 1, -0.1);
        ps.direction2 = V3(0.1, 1, 0.1);
        ps.gravity = V3(0, 0.3, 0);
        ps.minSize = 0.12;
        ps.maxSize = 0.3;
        ps.minLifeTime = 1;
        ps.maxLifeTime = 2;
        ps.emitRate = 40;
        ps.minEmitPower = 0.2;
        ps.maxEmitPower = 0.4;
        ps.color1 = new B.Color4(1, 1, 1, 0.12);
        ps.color2 = new B.Color4(1, 1, 1, 0.06);
        ps.colorDead = new B.Color4(1, 1, 1, 0);
        steam = ps;
      }
      if (sn === "kitchenSink") {
        box("ksink", 0.55, 0.04, 0.4, 0, 0.98, 0, metal, n);
        cyl("ktap", 0.25, 0.03, 0.03, metal, n, 8).position.set(0, 1.1, 0.25);
        sinkMug = cyl("sinkmug", 0.1, 0.08, 0.07, mat("#d9e1e8"), n, 12);
        sinkMug.position.set(0.12, 1.02, 0.02);
        box("window-k", 0.01, 0.01, 0.01, 0, 0, 0, white, n, false);
      }
      if (sn === "counter") {
        box("coffee", 0.22, 0.32, 0.22, -0.3, 1.13, 0.1, dark, n);
        box("toaster", 0.28, 0.18, 0.16, 0.2, 1.06, 0.1, metal, n);
        shelfMug = cyl("shelfmug", 0.1, 0.08, 0.07, mat("#d9e1e8"), n, 12);
        shelfMug.position.set(0.0, 1.03, 0.2);
      }
    });
    if (spots.dinnerSeat) {
      chair("dinnerSeat");
      const n = anchor("dinnerSeat", 0.72, 0);
      box("dtable", 1.4, 0.06, 0.85, 0, 0.8, 0, woodLight, n);
      [[-0.62, -0.35], [0.62, -0.35], [-0.62, 0.35], [0.62, 0.35]].forEach((p, i) => box("dtl" + i, 0.06, 0.76, 0.06, p[0], 0.42, p[1], woodLight, n));
      props.plate = cyl("plate", 0.02, 0.3, 0.26, white, n, 20);
      props.plate.position.set(0, 0.84, -0.12);
      box("fruit", 0.25, 0.12, 0.25, 0.4, 0.88, 0.15, mat("#c9a04f"), n);
      const opp = new B.TransformNode("oppchair", scene);
      opp.parent = n;
      opp.position.set(0, 0, 0.72);
      opp.rotation.y = PI;
      box("oseat", 0.48, 0.07, 0.46, 0, 0.5, -0.05, wood, opp);
      box("oback", 0.48, 0.55, 0.06, 0, 0.8, -0.3, wood, opp);
    }

    /* Wall clock in the kitchen */
    let hourHand = null;
    let minuteHand = null;
    if (rooms.kitchen && rooms.kitchen.area) {
      const a = rooms.kitchen.area;
      const clock = new B.TransformNode("wallclock", scene);
      clock.position.set(a[2] - 0.9, 2.0, a[1] + 0.1);
      const face = B.MeshBuilder.CreateCylinder("clockface", { height: 0.05, diameter: 0.46, tessellation: 28 }, scene);
      face.parent = clock;
      face.rotation.x = PI / 2;
      face.material = white;
      const hand = (name, len, thick) => {
        const p = new B.TransformNode(name, scene);
        p.parent = clock;
        p.position.z = 0.04;
        box(name + "m", thick, len, 0.012, 0, len / 2, 0, dark, p, false);
        return p;
      };
      hourHand = hand("hour", 0.12, 0.03);
      minuteHand = hand("minute", 0.19, 0.02);
    }

    /* Office */
    const workDesk = desk("desk", { w: 1.5, screen: true });
    props.workScreen = workDesk && workDesk.screen;
    chair("desk", "#3d4652");
    let deskGlass = null;
    let deskPhone = null;
    if (workDesk) {
      const g = cyl("glass", 0.16, 0.08, 0.07, mat("#d7ecf5", { alpha: 0.35, spec: 0.9 }), workDesk.node, 14);
      g.position.set(0.55, 0.93, -0.1);
      const water = cyl("water", 0.12, 0.07, 0.06, mat("#7fb6d6", { alpha: 0.7 }), workDesk.node, 14);
      water.position.set(0.55, 0.91, -0.1);
      deskGlass = water;
      deskPhone = box("dphone", 0.08, 0.015, 0.15, -0.5, 0.86, -0.15, dark, workDesk.node);
      box("dmug", 0.08, 0.1, 0.08, -0.62, 0.9, 0.12, mat("#c46b52"), workDesk.node);
      cyl("dpot", 0.16, 0.14, 0.12, mat("#a0644c"), workDesk.node, 12).position.set(0.62, 0.93, 0.2);
      sphere("dplant", 0.26, leafMs[1], workDesk.node, 8).position.set(0.62, 1.1, 0.2);
    }
    const coDesk = desk("coworkerDesk", { w: 1.4, screen: true });
    if (coDesk) coDesk.screen.emissiveColor = new B.Color3(0.25, 0.42, 0.55);
    chair("coworkerDesk", "#3d4652");
    if (spots.meetSeat) {
      chair("meetSeat", "#3d4652");
      chair("meetOther", "#3d4652");
      const n = anchor("meetSeat", 0.75, 0);
      box("mtable", 1.7, 0.06, 0.95, 0, 0.8, 0, woodLight, n);
      box("mtleg", 0.1, 0.74, 0.5, 0, 0.42, 0, dark, n);
      const scrN = anchor("meetSeat", 2.0, 1.3, PI);
      if (scrN) box("mscreen", 1.2, 0.7, 0.04, 0, 1.5, 0, dark, scrN);
    }
    if (spots.microwave) {
      const n = anchor("microwave", 0.72, -0.6);
      box("bcounter", 2.4, 0.9, 0.6, 0, 0.5, 0, mat("#d0d4d8"), n);
      box("bctop", 2.42, 0.05, 0.64, 0, 0.97, 0, mat("#4a4440"), n);
      box("mwave", 0.55, 0.32, 0.4, 0.6, 1.16, 0.05, dark, n);
      const ml = glowMat("#1a1a1a");
      microwaveLight = ml;
      glowing(box("mwindow", 0.32, 0.22, 0.01, 0.52, 1.16, -0.152, ml, n, false));
      box("wcooler", 0.32, 0.5, 0.3, -0.8, 1.25, 0.08, white, n);
      cyl("wbottle", 0.38, 0.26, 0.26, mat("#8fc6e0", { alpha: 0.6 }), n, 14).position.set(-0.8, 1.69, 0.08);
    }
    if (spots.lunchSeat) {
      chair("lunchSeat", "#c9a04f");
      const n = anchor("lunchSeat", 0.72, 0);
      cyl("ltable", 0.06, 1.0, 1.0, white, n, 24).position.y = 0.8;
      cyl("ltleg", 0.76, 0.08, 0.08, metal, n, 8).position.y = 0.4;
    }
    let elevatorDoors = null;
    if (spots.elevatorIn && rooms.elevator && rooms.elevator.area) {
      const a = rooms.elevator.area;
      const em = mat("#8d969f", { spec: 0.4 });
      const cx = (a[0] + a[2]) / 2;
      box("ewallL", 0.12, 2.5, a[3] - a[1], a[0] + 0.06, 1.3, (a[1] + a[3]) / 2, em);
      box("ewallR", 0.12, 2.5, a[3] - a[1], a[2] - 0.06, 1.3, (a[1] + a[3]) / 2, em);
      box("ewallB", a[2] - a[0], 2.5, 0.12, cx, 1.3, a[1], em);
      box("etop", a[2] - a[0], 0.2, 0.2, cx, 2.5, a[3], em);
      const dm = mat("#b7bfc6", { spec: 0.7 });
      const dl = box("edoorL", (a[2] - a[0]) / 2 - 0.1, 2.3, 0.06, cx - (a[2] - a[0]) / 4, 1.25, a[3], dm);
      const dr = box("edoorR", (a[2] - a[0]) / 2 - 0.1, 2.3, 0.06, cx + (a[2] - a[0]) / 4, 1.25, a[3], dm);
      elevatorDoors = { l: dl, r: dr, cx, w: (a[2] - a[0]) / 4, z: a[3], open: 0 };
      if (spots.elevatorCall) glowing(box("ebutton", 0.08, 0.12, 0.04, a[2] + 0.25, 1.2, a[3] + 0.04, glowMat("#7ec8e3", "#2a5566")));
    }
    if (spots.lobby) {
      const n = anchor("lobby", -0.2, 4.5);
      box("reception", 2.0, 1.05, 0.6, 0, 0.6, 0, mat("#59636e"), n);
      box("rtop", 2.1, 0.05, 0.7, 0, 1.15, 0, woodLight, n);
      cyl("lpot", 0.5, 0.4, 0.32, mat("#a0644c"), null, 12).position.set(officeO[0] + 17.3, 0.35, 4.1);
      sphere("lplant", 0.9, leafMs[2], null, 8).position.set(officeO[0] + 17.3, 1.0, 4.1);
    }
    if (spots.entranceOut && cfg.buildings.office) {
      const z = cfg.buildings.office.bounds[3] + officeO[1];
      const x = spots.entranceOut.x;
      const fm = mat("#3b434c");
      box("eframeL", 0.12, 2.5, 0.2, x - 0.95, 1.3, z, fm);
      box("eframeR", 0.12, 2.5, 0.2, x + 0.95, 1.3, z, fm);
      box("eframeT", 2.0, 0.2, 0.2, x, 2.55, z, fm);
      const sign = box("sign", 3.4, 0.5, 0.08, x, 3.2, z + 0.05, mat("#2f3a46"));
      glowing(box("signtext", 2.8, 0.18, 0.01, x, 3.2, z + 0.1, glowMat("#e8e4da", "#8a8578"), null, false));
      sign.receiveShadows = false;
    }

    /* Parked cars that never move, in the work lot */
    function makeCar(color) {
      const root = new B.TransformNode("car", scene);
      const body = mat(color, { spec: 0.35 });
      const glass = mat("#26303a", { spec: 0.8 });
      box("lower", 1.78, 0.55, 4.1, 0, 0.55, 0, body, root);
      box("cabin", 1.6, 0.55, 2.1, 0, 1.08, -0.25, glass, root);
      box("roof", 1.5, 0.08, 1.9, 0, 1.38, -0.3, body, root);
      box("pillarF", 1.6, 0.5, 0.08, 0, 1.08, 0.78, body, root);
      const wheels = [];
      [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.35], [0.85, -1.35]].forEach((p, i) => {
        const axle = new B.TransformNode("axle" + i, scene);
        axle.parent = root;
        axle.position.set(p[0], 0.36, p[1]);
        const w = cyl("wheel" + i, 0.24, 0.68, 0.68, dark, axle, 16);
        w.rotation.z = PI / 2;
        cyl("hub" + i, 0.26, 0.3, 0.3, metal, axle, 12).rotation.z = PI / 2;
        wheels.push(axle);
      });
      const hl = glowMat("#fff6dc", "#2a2822");
      const tl = glowMat("#8a1d1d", "#3a0b0b");
      glowing(box("hlL", 0.38, 0.14, 0.04, -0.6, 0.7, 2.06, hl, root, false));
      glowing(box("hlR", 0.38, 0.14, 0.04, 0.6, 0.7, 2.06, hl, root, false));
      glowing(box("tlL", 0.38, 0.12, 0.04, -0.6, 0.72, -2.06, tl, root, false));
      glowing(box("tlR", 0.38, 0.12, 0.04, 0.6, 0.72, -2.06, tl, root, false));
      return { root, wheels, hl, tl };
    }
    if (pw) {
      ["#9a3b3b", "#d8d8d2", "#2f3c52", "#6c7a5e", "#c9a04f"].forEach((c, i) => {
        if (i === 2) return;
        const c2 = makeCar(c);
        c2.root.position.set(pw.x + (i - 2) * 2.6, 0, pw.z + (i % 2 ? 0.2 : -0.1));
        c2.root.rotation.y = PI;
      });
    }

    /* Ambient traffic */
    const traffic = [];
    ["#7d8a96", "#b55a3c", "#e4e0d6", "#3e4a5c", "#567a62", "#8a6aa0", "#c2c7cc", "#4b4b4b"].forEach((c, i) => {
      const t = makeCar(c);
      traffic.push({ car: t, lane: i % 2 ? RZ + 0.7 : RZ - 0.7, dir: i % 2 ? -1 : 1, speed: 8 + (i % 3) * 2, offset: i * 317 });
    });

    /* ---------------- the person ---------------- */
    const outfits = (cfg.person && cfg.person.outfits) || {};
    function makePerson(colors, isMain) {
      const skin = mat(colors.skin || "#e2b394");
      const hair = mat(colors.hair || "#2a2422");
      const top = mat(colors.top || "#c46b52", { unique: true });
      const bottom = mat(colors.bottom || "#3a3e46", { unique: true });
      const shoeM = mat(colors.shoes || "#241f1c", { unique: true });
      const root = new B.TransformNode("person", scene);
      const tilt = new B.TransformNode("tilt", scene);
      tilt.parent = root;
      const spin = new B.TransformNode("spin", scene);
      spin.parent = tilt;
      const J = {};
      const pivot = (id, parent, x, y, z) => {
        const n = new B.TransformNode(id, scene);
        n.parent = parent;
        n.position.set(x, y, z);
        J[id] = n;
        return n;
      };
      box("pelvis", 0.32, 0.16, 0.2, 0, 0.0, 0, bottom, spin).scaling.set(1, 1, 1);
      const torso = pivot("torso", spin, 0, 0.06, 0);
      const chest = capsule("chest", 0.56, 0.17, top, torso);
      chest.position.y = 0.27;
      chest.scaling.set(1.05, 1, 0.72);
      const neck = cyl("neck", 0.1, 0.09, 0.1, skin, torso, 10);
      neck.position.y = 0.56;
      const head = pivot("head", torso, 0, 0.6, 0);
      const skull = sphere("skull", 0.26, skin, head, 14);
      skull.position.y = 0.12;
      skull.scaling.set(0.92, 1.05, 0.98);
      const hairM = sphere("hair", 0.28, hair, head, 12);
      hairM.position.set(0, 0.17, -0.02);
      hairM.scaling.set(0.98, 0.72, 1.0);
      const nose = sphere("nose", 0.05, skin, head, 6);
      nose.position.set(0, 0.11, 0.125);
      [-0.05, 0.05].forEach((x, i) => {
        const e = sphere("eye" + i, 0.032, dark, head, 6);
        e.position.set(x, 0.14, 0.115);
      });
      const arm = (side, x) => {
        const sh = pivot("sh" + side, torso, x, 0.47, 0);
        const ua = capsule("ua" + side, 0.32, 0.055, top, sh);
        ua.position.y = -0.14;
        const el = pivot("el" + side, sh, 0, -0.29, 0);
        const fa = capsule("fa" + side, 0.3, 0.045, skin, el);
        fa.position.y = -0.13;
        const hand = sphere("hand" + side, 0.09, skin, el, 8);
        hand.position.y = -0.29;
        hand.scaling.set(0.8, 1, 0.6);
        const slot = pivot("slot" + side, el, 0, -0.3, 0.02);
        return slot;
      };
      const slotL = arm("L", -0.215);
      const slotR = arm("R", 0.215);
      const leg = (side, x) => {
        const hip = pivot("hip" + side, spin, x, -0.04, 0);
        const th = capsule("th" + side, 0.46, 0.075, bottom, hip);
        th.position.y = -0.21;
        const kn = pivot("kn" + side, hip, 0, -0.43, 0);
        const sh = capsule("shin" + side, 0.44, 0.06, bottom, kn);
        sh.position.y = -0.2;
        const foot = box("foot" + side, 0.1, 0.07, 0.24, 0, -0.43, 0.05, shoeM, kn);
        foot.position.y = -0.43;
      };
      leg("L", -0.095);
      leg("R", 0.095);
      let phone = null;
      let cup = null;
      let bag = null;
      if (isMain) {
        phone = box("phone", 0.07, 0.14, 0.012, 0, -0.02, 0.04, dark, slotR);
        phone.rotation.x = -0.3;
        const screen = box("phonescreen", 0.06, 0.12, 0.002, 0, -0.02, 0.048, glowMat("#9cc6e8", "#1e2c3a"), slotR, false);
        screen.rotation.x = -0.3;
        glowing(screen);
        phone.screen = screen;
        cup = cyl("cup", 0.1, 0.08, 0.07, mat("#d9e1e8"), slotR, 12);
        cup.position.set(0, 0.02, 0.05);
        bag = box("bag", 0.36, 0.3, 0.12, 0.1, -0.2, 0, mat("#5a4636"), slotL);
      }
      return { root, tilt, spin, J, top, bottom, shoes: shoeM, phone, cup, bag, phase: 0, pose: "stand", inited: false };
    }

    const P = cfg.person || {};
    const me = makePerson({ skin: P.skin, hair: P.hair, shoes: P.shoes, top: "#c46b52", bottom: "#3a3e46" }, true);
    const npcs = (cfg.people || [])
      .map((p) => {
        const s = spots[p.at];
        if (!s) return null;
        const n = makePerson({ skin: p.skin || "#c9967a", hair: p.hair || "#3b2a22", top: p.top || "#5f7d99", bottom: p.bottom || "#3a3e46" }, false);
        n.root.position.set(s.x, 0, s.z);
        n.root.rotation.y = s.face;
        return { def: p, person: n };
      })
      .filter(Boolean);

    const myCar = makeCar("#355848");
    const headSpot = new B.SpotLight("headbeam", V3(0, 0.8, 2.2), V3(0, -0.15, 1), PI / 3, 6, scene);
    headSpot.parent = myCar.root;
    headSpot.diffuse = B.Color3.FromHexString("#fff1cf");
    headSpot.intensity = 0;
    headSpot.range = 30;

    /* Shadow casters: people, car, furniture near buildings */
    casters.forEach((m) => {
      if (Math.abs(m.getAbsolutePosition().x) < 1e6) shadows.addShadowCaster(m, false);
    });
    scene.meshes.forEach((m) => {
      if (m.receiveShadows === false && m !== ground) return;
    });
    scene.meshes.forEach((m) => {
      if (m.material && m.material.alpha === 1 && m.name !== "ground") m.receiveShadows = true;
    });

    /* Lights only touch the building they are in (keeps the light count low). */
    const peopleMeshes = () => scene.meshes.filter((m) => {
      let p = m.parent;
      while (p) {
        if (p === me.root || p === myCar.root || npcs.some((n) => n.person.root === p)) return true;
        p = p.parent;
      }
      return false;
    });
    const movers = peopleMeshes();
    roomLights.forEach((rl) => {
      rl.light.includedOnlyMeshes = (buildingMeshes[rl.building] || []).concat(movers, casters.filter((c) => c.getAbsolutePosition().x < 100));
    });
    officeLights.forEach((L) => {
      L.includedOnlyMeshes = (buildingMeshes.office || []).concat(movers, casters.filter((c) => c.getAbsolutePosition().x > 1000));
    });
    headSpot.includedOnlyMeshes = [ground, road];

    function dotTexture() {
      if (dotTexture.tex) return dotTexture.tex;
      const t = new B.DynamicTexture("dot", 64, scene, false);
      const c = t.getContext();
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
      t.hasAlpha = true;
      t.update();
      dotTexture.tex = t;
      return t;
    }

    /* ---------------- poses and gestures ---------------- */
    const POSE = {
      stand: { y: 1.01, pitch: 0, roll: 0, torso: 0, hip: 0, knee: 0, sh: 0.06, el: -0.12 },
      walk: { y: 1.01, pitch: 0, roll: 0, torso: 0.04, hip: 0, knee: 0, sh: 0.05, el: -0.25 },
      sitChair: { y: 0.63, pitch: 0, roll: 0, torso: 0.04, hip: -1.52, knee: 1.52, sh: -0.12, el: -0.9 },
      sitCouch: { y: 0.62, pitch: 0, roll: 0, torso: -0.2, hip: -1.38, knee: 1.4, sh: -0.05, el: -0.75 },
      sitBed: { y: 0.71, pitch: 0, roll: 0, torso: 0.12, hip: -1.45, knee: 1.4, sh: -0.2, el: -0.6 },
      toilet: { y: 0.61, pitch: 0, roll: 0, torso: 0.18, hip: -1.5, knee: 1.5, sh: -0.35, el: -0.95 },
      sitCar: { y: 0.55, pitch: 0, roll: 0, torso: -0.18, hip: -1.3, knee: 1.05, sh: -0.95, el: -0.55 },
      lie: { y: 0.8, pitch: -PI / 2, roll: 0, torso: 0, hip: 0, knee: 0, sh: 0.08, el: -0.15 },
      side: { y: 0.86, pitch: -PI / 2, roll: 1.35, torso: 0.1, hip: -0.55, knee: 0.95, sh: -0.7, el: -1.1 },
      recline: { y: 0.88, pitch: -1.0, roll: 0, torso: 0, hip: -0.6, knee: 0.08, sh: -0.2, el: -0.7 },
    };

    function gesture(hand, pose, t) {
      const lying = pose === "lie" || pose === "side";
      const s = (f, a) => Math.sin(t * f) * a;
      switch (hand) {
        case "type":
          return { shL: -0.5, elL: -1.15 + s(13, 0.07), shR: -0.5, elR: -1.15 + s(11.3, 0.07), head: 0.18 };
        case "phone":
          return { shR: -0.4, elR: -2.0, shL: -0.3, elL: -1.55, head: 0.42, phone: true };
        case "reach":
          if (lying) return { shL: -0.25, shLz: -1.25 + s(2, 0.06), elL: -0.2 };
          return { shR: -1.35 + s(2, 0.05), elR: -0.2 };
        case "stretch":
          return { shL: -2.95, elL: -0.15, shR: -2.95, elR: -0.15, head: -0.25 };
        case "eat":
          return { shR: -0.35, elR: -1.75 + s(3.2, 0.32), shL: -0.35, elL: -1.2, head: 0.2 };
        case "drink":
          return { shR: -0.55 + s(1.2, 0.05), elR: -2.15, head: -0.12, cup: true };
        case "wash":
          return { shL: -0.6, elL: -0.9, shR: -0.6, elR: -0.9, shLz: s(9, 0.12), shRz: -s(9, 0.12), head: 0.3 };
        case "brush":
          return { shR: -0.35, elR: -2.3 + s(18, 0.08), head: 0.05 };
        case "hold":
          return { shR: -0.3, elR: -1.0, shL: -0.3, elL: -1.0 };
        case "remote":
          return { shR: -0.5, elR: -1.25, head: 0.05, phone: true };
        case "cook":
          return { shR: -0.6, elR: -1.0, shRz: s(4, 0.2), shL: -0.45, elL: -1.15, head: 0.35 };
        case "wheel":
          return { shL: -1.0, elL: -0.55, shR: -1.0, elR: -0.55, shLz: s(0.7, 0.04), shRz: s(0.7, 0.04) };
        case "dress":
          return { shL: -1.2 + s(3, 0.8), elL: -1.2, shR: -1.2 - s(3, 0.8), elR: -1.2, head: 0.2 };
        case "towel":
          return { shR: -2.2 + s(4, 0.4), elR: -1.6, shL: -0.9 + s(4, 0.3), elL: -1.0 };
        case "face":
          return { shR: -0.65, elR: -2.35, head: 0.12 };
        case "nod":
          return { head: Math.max(0, Math.sin(t * 3)) * 0.3 };
        default:
          return {};
      }
    }

    function posePerson(p, poseName, hand, dt, moving, snap, t) {
      const spec = POSE[poseName] || POSE.stand;
      const g = gesture(hand, poseName, t);
      const sw = moving ? Math.sin(p.phase) : 0;
      const breathe = Math.sin(t * 1.7) * 0.015;
      const target = {
        pitch: spec.pitch,
        roll: spec.roll,
        torso: spec.torso + breathe,
        head: (g.head != null ? g.head : 0) + (moving ? 0.05 : Math.sin(t * 0.37) * 0.05),
        headY: moving ? 0 : Math.sin(t * 0.23) * 0.18,
        shL: g.shL != null ? g.shL : spec.sh + sw * 0.45,
        shR: g.shR != null ? g.shR : spec.sh - sw * 0.45,
        shLz: g.shLz != null ? g.shLz : 0.06,
        shRz: g.shRz != null ? g.shRz : -0.06,
        elL: g.elL != null ? g.elL : spec.el,
        elR: g.elR != null ? g.elR : spec.el,
        hipL: spec.hip + (moving ? sw * 0.55 : 0),
        hipR: spec.hip - (moving ? sw * 0.55 : 0),
        knL: spec.knee + (moving ? Math.max(0, -Math.sin(p.phase - 0.9)) * 0.8 : 0),
        knR: spec.knee + (moving ? Math.max(0, Math.sin(p.phase - 0.9)) * 0.8 : 0),
      };
      const k = snap || !p.inited ? 1 : 1 - Math.exp(-9 * dt);
      const kk = snap || !p.inited ? 1 : 1 - Math.exp(-5 * dt);
      const J = p.J;
      const L = (o, key, v, kv) => {
        o[key] += (v - o[key]) * (kv || k);
      };
      L(p.tilt.rotation, "x", target.pitch, kk);
      L(p.spin.rotation, "y", target.roll, kk);
      L(J.torso.rotation, "x", target.torso);
      L(J.head.rotation, "x", target.head);
      L(J.head.rotation, "y", target.headY);
      L(J.shL.rotation, "x", target.shL);
      L(J.shR.rotation, "x", target.shR);
      L(J.shL.rotation, "z", target.shLz);
      L(J.shR.rotation, "z", target.shRz);
      L(J.elL.rotation, "x", target.elL);
      L(J.elR.rotation, "x", target.elR);
      L(J.hipL.rotation, "x", target.hipL);
      L(J.hipR.rotation, "x", target.hipR);
      L(J.knL.rotation, "x", target.knL);
      L(J.knR.rotation, "x", target.knR);
      p.inited = true;
      if (p.phone) {
        p.phone.setEnabled(!!g.phone);
      }
      if (p.cup) p.cup.setEnabled(!!g.cup);
      return spec;
    }

    /* ---------------- sky ---------------- */
    const SR = window.DayEngine.parseClock(((cfg.sky || {}).sunrise) || "6:45") / 60;
    const SS = window.DayEngine.parseClock(((cfg.sky || {}).sunset) || "18:45") / 60;
    function daylight(h) {
      if (h < SR - 1 || h > SS + 1.2) return 0.03;
      if (h < SR + 0.8) return 0.03 + 0.67 * ((h - (SR - 1)) / 1.8);
      if (h > SS - 0.8) return 0.03 + 0.67 * ((SS + 1.2 - h) / 2.0);
      const mid = (SR + SS) / 2;
      return 0.7 + 0.3 * (1 - Math.abs(h - mid) / (mid - SR));
    }
    const C = (h) => B.Color3.FromHexString(h);
    const SKY = [
      [0, C("#0d1220")],
      [SR - 1, C("#141b2e")],
      [SR - 0.2, C("#d98a6c")],
      [SR + 0.9, C("#9cc4dc")],
      [12, C("#86b8de")],
      [SS - 0.9, C("#a7c2d6")],
      [SS, C("#de8a5e")],
      [SS + 0.7, C("#4a3d5c")],
      [SS + 1.5, C("#141b2e")],
      [24, C("#0d1220")],
    ];
    function skyAt(h) {
      for (let i = 0; i < SKY.length - 1; i++) {
        if (h >= SKY[i][0] && h <= SKY[i + 1][0]) {
          const t = (h - SKY[i][0]) / Math.max(1e-6, SKY[i + 1][0] - SKY[i][0]);
          return B.Color3.Lerp(SKY[i][1], SKY[i + 1][1], t);
        }
      }
      return SKY[0][1];
    }

    /* ---------------- per-frame update ---------------- */
    const cam = { x: 0, y: 1, z: 0, alpha: 1.3, beta: 1.05, radius: 9, user: 0, inited: false, room: null };
    const markUser = () => {
      cam.user = 7;
    };
    canvas.addEventListener("pointerdown", markUser);
    canvas.addEventListener("wheel", markUser, { passive: true });
    canvas.addEventListener("touchstart", markUser, { passive: true });

    const state = { carYaw: null, lastX: null, lastZ: null };
    const things0 = {};
    let elapsed = 0;

    function setEmissive(m, hex, k) {
      const c = B.Color3.FromHexString(hex);
      m.emissiveColor.set(c.r * k, c.g * k, c.b * k);
    }

    function update(fr, dt, opts) {
      opts = opts || {};
      elapsed += dt;
      const t = elapsed;
      const things = fr.things || things0;
      const minutes = fr.minutes;
      const hour = (minutes % 1440) / 60;
      const day = daylight(hour);
      const snap = !!opts.snap;

      /* sky & sun */
      const sky = skyAt(hour);
      scene.clearColor.set(sky.r, sky.g, sky.b, 1);
      scene.fogColor = sky;
      const ang = ((hour - SR) / (SS - SR)) * PI;
      const elev = Math.sin(Math.max(0, Math.min(PI, ang)));
      sun.direction.set(-Math.cos(ang) * 0.7, -Math.max(0.3, elev), -0.55);
      sun.intensity = hour > SR - 0.3 && hour < SS + 0.3 ? 0.2 + elev * 0.6 : 0.02;
      sun.diffuse = elev > 0.35 ? C("#fff4e2") : C("#ffb47e");
      hemi.intensity = 0.17 + day * 0.44;
      hemi.diffuse = B.Color3.Lerp(C("#6a7fb8"), C("#f7f2e8"), Math.min(1, day * 1.2));
      hemi.groundColor = B.Color3.Lerp(C("#151820"), C("#4b4436"), day);
      pipeline.imageProcessing.exposure = 0.95 + (1 - day) * 0.3;
      windows.forEach((w) => {
        w.material.emissiveColor.set(sky.r * (0.35 + day * 0.4), sky.g * (0.35 + day * 0.4), sky.b * (0.35 + day * 0.45));
      });
      const night = 1 - Math.min(1, day * 1.6);
      setEmissive(lampHeadM, "#ffe2a6", 0.1 + night * 0.85);
      setEmissive(winM, "#f2c27a", night * 0.9);
      winM.diffuseColor = B.Color3.Lerp(C("#2b3340"), C("#f2c27a"), night * 0.5);

      /* room lights */
      roomLights.forEach((rl) => {
        const on = things[rl.thing] === "on" ? 1 : 0;
        rl.level = snap ? on : damp(rl.level, on, dt, 10);
        rl.light.intensity = rl.level * (0.55 + night * 0.65);
      });
      const officeOn = things.officeLights !== "off" ? 1 : 0;
      officeLights.forEach((L) => (L.intensity = officeOn * (0.12 + night * 0.35)));
      if (bedLampShade) setEmissive(bedLampShade, "#ffd08a", things.bedroomLamp === "on" ? 1.3 : 0.02);
      if (props.floorLamp) setEmissive(props.floorLamp, "#ffd08a", things.livingLight === "on" ? 1.1 : 0.02);

      /* screens */
      const flick = 0.85 + Math.sin(t * 2.3) * 0.08 + Math.sin(t * 7.1) * 0.05;
      const scr = (m, key, hex) => {
        if (!m) return;
        const v = things[key];
        if (v === "on") setEmissive(m, hex, flick);
        else if (v === "locked") setEmissive(m, "#3b4a66", 0.5);
        else m.emissiveColor.set(0.01, 0.01, 0.012);
      };
      scr(props.tv, "tv", "#7aa6d8");
      scr(props.bedTv, "bedTv", "#8f7ad8");
      scr(props.pc, "pc", "#9ec3e6");
      scr(props.workScreen, "workScreen", "#cfe0f2");

      /* alarm */
      if (alarmFace) {
        const a = things.alarm;
        if (a === "ringing") setEmissive(alarmFace, "#ff4a3a", Math.sin(t * 12) > 0 ? 1.6 : 0.3);
        else setEmissive(alarmFace, "#5fd38a", 0.5);
      }

      /* doors, fridge, stove, microwave, shower */
      if (frontDoorNode) {
        const target = things.frontDoor === "open" ? 1.4 : 0;
        frontDoorNode.rotation.y = snap ? target : damp(frontDoorNode.rotation.y, target, dt, 6);
      }
      if (fridgeDoor) {
        const open = things.fridge === "open";
        fridgeDoor.rotation.y = snap ? (open ? 1.6 : 0) : damp(fridgeDoor.rotation.y, open ? 1.6 : 0, dt, 6);
        setEmissive(fridgeLight, "#f2f6ff", open ? 1.0 : 0);
      }
      if (burner) setEmissive(burner, "#ff4a1c", things.stove === "on" ? 1.2 + Math.sin(t * 5) * 0.1 : 0);
      if (steam) {
        if (things.stove === "on" && !steam.isStarted()) steam.start();
        if (things.stove !== "on" && steam.isStarted()) steam.stop();
      }
      if (microwaveLight) setEmissive(microwaveLight, "#ffcf7a", things.microwave === "on" ? 1.1 : 0);
      if (showerWater) {
        if (things.shower === "on" && !showerWater.isStarted()) showerWater.start();
        if (things.shower !== "on" && showerWater.isStarted()) showerWater.stop();
      }
      if (sinkMug) sinkMug.setEnabled(things.mug === "sink");
      if (shelfMug) shelfMug.setEnabled(things.mug === "shelf");
      if (deskGlass) {
        const lvl = things.deskGlass === "full" ? 1 : things.deskGlass === "half" ? 0.5 : 0;
        deskGlass.setEnabled(lvl > 0);
        deskGlass.scaling.y = Math.max(0.05, lvl);
        deskGlass.position.y = 0.85 + 0.06 * lvl;
      }
      if (deskPhone) deskPhone.setEnabled(String(things.phone || "").includes("desk"));
      if (nightPhone) nightPhone.setEnabled(String(things.phone || "").startsWith("nightstand"));
      if (props.bag) props.bag.setEnabled(!String(things.carrying || "").includes("bag") && fr.person.x < 100 && !fr.person.inCar);
      signalLamps.forEach((s) => {
        const red = things[s.thing] === "red";
        setEmissive(s.red, "#ff3b30", red ? 1.8 : 0.08);
        setEmissive(s.green, "#33d17a", red ? 0.08 : 1.6);
      });
      if (hourHand) {
        hourHand.rotation.z = -(((minutes / 60) % 12) / 12) * PI * 2;
        minuteHand.rotation.z = -((minutes % 60) / 60) * PI * 2;
      }

      /* quilt */
      const pp = fr.person;
      const inBed = spots.bed && Math.hypot(pp.x - spots.bed.x, pp.z - spots.bed.z) < 0.4 && ["lie", "side", "recline"].includes(pp.pose);
      if (quiltUp) {
        quiltUp.setEnabled(inBed && things.blanket !== "down");
        quiltDown.setEnabled(!(inBed && things.blanket !== "down"));
        quiltUp.scaling.z = pp.pose === "recline" ? 0.72 : 1;
        quiltUp.position.z = pp.pose === "recline" ? 0.55 : 0.36;
      }

      /* car */
      const car = fr.car;
      myCar.root.position.set(car.x, 0, car.z);
      if (state.carYaw == null || snap) state.carYaw = car.yaw;
      state.carYaw = dampAngle(state.carYaw, car.yaw, dt, car.moving ? 6 : 3);
      myCar.root.rotation.y = state.carYaw;
      if (car.moving) {
        const dx = state.lastCarX == null ? 0 : Math.hypot(car.x - state.lastCarX, car.z - state.lastCarZ);
        myCar.wheels.forEach((w) => (w.rotation.x += dx / 0.34));
      }
      state.lastCarX = car.x;
      state.lastCarZ = car.z;
      const lights = things.headlights === "on" || (things.engine === "on" && night > 0.4);
      setEmissive(myCar.hl, "#fff3d0", lights ? 1.6 : 0.05);
      setEmissive(myCar.tl, "#ff2a2a", things.engine === "on" ? (car.moving ? 0.7 : 1.4) : 0.05);
      headSpot.intensity = lights ? 1.6 * night : 0;

      /* traffic */
      const tSec = minutes * 60;
      traffic.forEach((tr) => {
        const len = street.to - street.from - 40;
        let x = ((tSec * tr.speed + tr.offset) % len + len) % len;
        x = tr.dir > 0 ? street.from + 20 + x : street.to - 20 - x;
        const tooClose = Math.hypot(x - car.x, tr.lane - car.z) < 9;
        tr.car.root.setEnabled(!tooClose);
        tr.car.root.position.set(x, 0, tr.lane);
        tr.car.root.rotation.y = tr.dir > 0 ? PI / 2 : -PI / 2;
        setEmissive(tr.car.hl, "#fff3d0", night > 0.3 ? 1.4 : 0.05);
        setEmissive(tr.car.tl, "#ff2a2a", night > 0.3 ? 0.8 : 0.1);
      });

      /* person */
      const outfit = outfits[things.outfit] || outfits.work || { top: "#c46b52", bottom: "#3a3e46" };
      me.top.diffuseColor = C(outfit.top);
      me.bottom.diffuseColor = C(outfit.bottom);
      me.shoes.diffuseColor = C(outfit.feet || P.shoes || "#241f1c");
      if (pp.inCar) {
        if (me.root.parent !== myCar.root) me.root.parent = myCar.root;
        me.root.position.set(-0.4, POSE.sitCar.y, 0.05);
        me.root.rotation.y = 0;
      } else {
        if (me.root.parent) me.root.parent = null;
        const spec = POSE[pp.pose] || POSE.stand;
        me.root.position.set(pp.x, spec.y, pp.z);
        if (state.yaw == null || snap) state.yaw = pp.yaw;
        state.yaw = dampAngle(state.yaw, pp.yaw, dt, pp.walking ? 12 : 7);
        me.root.rotation.y = state.yaw;
      }
      const moved = state.lastX == null ? 0 : Math.hypot(pp.x - state.lastX, pp.z - state.lastZ);
      state.lastX = pp.x;
      state.lastZ = pp.z;
      if (pp.walking && !pp.inCar) me.phase += Math.min(moved, 0.4) * 5.2;
      posePerson(me, pp.inCar ? "sitCar" : pp.walking ? "walk" : pp.pose, pp.walking && !["hold", "phone", "nod", "drink"].includes(pp.hand) ? "none" : pp.hand, dt, pp.walking && !pp.inCar, snap, t);
      if (me.bag) me.bag.setEnabled(String(things.carrying || "").includes("bag") && !pp.inCar);

      npcs.forEach((n) => {
        let show = true;
        Object.entries(n.def.when || {}).forEach(([k, v]) => {
          if (things[k] !== v) show = false;
        });
        const workHours = minutes > 8.5 * 60 && minutes < 18 * 60;
        if (!n.def.when && !workHours) show = false;
        n.person.root.setEnabled(show);
        if (!show) return;
        const spec = POSE[n.def.pose] || POSE.stand;
        n.person.root.position.y = spec.y;
        posePerson(n.person, n.def.pose || "stand", n.def.hand || "none", dt, false, snap, t + 3.3);
      });

      /* elevator doors open when someone walks through them */
      if (elevatorDoors) {
        const near = pp.walking && Math.hypot(pp.x - elevatorDoors.cx, pp.z - elevatorDoors.z) < 2.2;
        elevatorDoors.open = snap ? (near ? 1 : 0) : damp(elevatorDoors.open, near ? 1 : 0, dt, 5);
        elevatorDoors.l.position.x = elevatorDoors.cx - elevatorDoors.w - elevatorDoors.open * elevatorDoors.w * 1.6;
        elevatorDoors.r.position.x = elevatorDoors.cx + elevatorDoors.w + elevatorDoors.open * elevatorDoors.w * 1.6;
      }

      /* camera */
      const roomCam = pp.inCar ? (rooms.road && rooms.road.camera) : rooms[fr.room] && rooms[fr.room].camera;
      const shot = Object.assign({ alpha: 1.3, beta: 1.05, radius: 8 }, roomCam || {});
      const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
      if (aspect < 1.2) shot.radius *= Math.min(1.9, Math.pow(1.2 / aspect, 0.75));
      const tx = pp.inCar ? car.x : pp.x;
      const tz = pp.inCar ? car.z : pp.z;
      const ty = pp.inCar ? 1.0 : (POSE[pp.pose] || POSE.stand).y * 0.6 + 0.45;
      const jump = Math.hypot(tx - cam.x, tz - cam.z) > 25;
      if (!cam.inited || snap || jump) {
        cam.x = tx;
        cam.y = ty;
        cam.z = tz;
        if (cam.user <= 0 || !cam.inited) {
          cam.alpha = shot.alpha;
          cam.snapAlpha = true;
          cam.beta = shot.beta;
          cam.radius = shot.radius;
        }
        cam.inited = true;
      } else {
        const follow = pp.inCar ? 6 : 2.6;
        cam.x = damp(cam.x, tx, dt, follow);
        cam.y = damp(cam.y, ty, dt, follow);
        cam.z = damp(cam.z, tz, dt, follow);
      }
      cam.user = Math.max(0, cam.user - dt);
      camera.target.set(cam.x, cam.y, cam.z);
      /* keep an automatic camera inside the cutaway, never behind a side wall */
      const rm = !pp.inCar && rooms[fr.room];
      const bd = rm && cfg.buildings[rm.building];
      let alphaGoal = shot.alpha;
      if (bd && bd.bounds) {
        const o = bd.origin || [0, 0];
        const lo = bd.bounds[0] + o[0] + 0.4;
        const hi = bd.bounds[2] + o[0] - 0.4;
        const reach = shot.radius * Math.sin(shot.beta);
        const cx = cam.x + reach * Math.cos(alphaGoal);
        if (cx > hi) alphaGoal = Math.acos(Math.max(-1, Math.min(1, (hi - cam.x) / reach)));
        if (cx < lo) alphaGoal = Math.acos(Math.max(-1, Math.min(1, (lo - cam.x) / reach)));
      }
      if (cam.user > 0) {
        cam.alpha = camera.alpha;
        cam.beta = camera.beta;
        cam.radius = camera.radius;
      } else {
        cam.alpha = cam.snapAlpha ? alphaGoal : dampAngle(cam.alpha, alphaGoal, dt, 1.2);
        cam.snapAlpha = false;
        cam.beta = damp(cam.beta, shot.beta, dt, 1.2);
        cam.radius = damp(cam.radius, shot.radius, dt, 1.2);
        camera.alpha = cam.alpha + Math.sin(t * 0.05) * 0.04;
        camera.beta = cam.beta;
        camera.radius = cam.radius;
      }
      sun.position.set(cam.x - sun.direction.x * 40, 40, cam.z - sun.direction.z * 40);
    }

    return {
      engine,
      scene,
      update,
      resize() {
        engine.resize();
      },
      resetCamera() {
        cam.user = 0;
      },
      person: me.root, // read by the playtest
    };
  }

  window.DayWorld = { create };
})();
