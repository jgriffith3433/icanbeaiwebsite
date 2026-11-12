/* ==========================================================================
   Small Weather's 3D model: the rigged GLB from Hawkes Gen (hawkes.assets.json,
   models/small-weather.glb), worn over the box-built figure of js/world.js.

   The figure stays as the frame (the day and the controller place, tilt and seat
   it); its boxes hide and the model plays the clip that fits: idle, walk, run,
   jump, fall, float, cast and throw for the player, and the day's own (sit,
   type, phone, lie, side, recline). world.setSkin() puts it on.

   Hero motion (AAA plant): two-bone foot IK with Havok / ground raycasts so boots
   sit on gravel, stairs and the ramp; pelvis offset on slopes; stride-matched
   walk/run; landing crouch on hard impacts; a rim light that follows him; and
   extra clips (lookup, windbolt, windrain, triumph, shelter, window) from
   models/clips/*.glb.

   On top of the GLB's texture: the jacket's seams and the boots glow blue (the
   bright blue of the texture becomes emissive, in the glow layer), and while
   he's the player's, lightning coils his arms, strongest when he casts.

   day.config.js `control.model` is the GLB's path; null = the box figure.
   ========================================================================== */
import "@babylonjs/loaders/glTF/index.js"; // registers the .glb loader
import { clipAvatar } from "./avatar.js";

export const SKIN_CLIPS = [
  "idle", "walk", "run", "jump", "fall", "float", "cast", "throw",
  "sit", "type", "phone", "lie", "side", "recline",
  "lookup", "windbolt", "windrain", "triumph", "shelter", "window",
];
const LOOPS = ["idle", "walk", "run", "fall", "float", "sit", "type", "phone", "lie", "side", "recline", "shelter", "window"];
/* cast, throw, fall and float also live inside small-weather.glb, but those baked copies had their arms rolled 70-160
   degrees; the re-posed files in models/clips/ replace them (the baked group is dropped when its extra loads). */
const EXTRA_CLIPS = ["lookup", "windbolt", "windrain", "triumph", "shelter", "window", "cast", "throw", "fall", "float"];
/* Metres covered per loop of the clip with the stance foot planted, measured on models/small-weather.glb (stance foot
   speed at 1x times the loop length: walk 0.81 m/s over 1.067 s, run 1.63 m/s over 0.767 s). The playback speed is
   ground speed over this, so his boots keep pace with the ground. scripts/check-motion.mjs measures it again. */
export const WALK_STRIDE = 0.86;
export const RUN_STRIDE = 1.25;

/* How much lightning each clip has while he's the player's (0 on his day) */
const BOLTS = {
  cast: 1, throw: 1, windbolt: 1, windrain: 0.85, triumph: 0.9, float: 0.7, fall: 0.5, jump: 0.5,
  idle: 0.3, lookup: 0.25, walk: 0.25, run: 0.35, shelter: 0.2,
};

const FOOT_SLIDE_LIMIT = 0.05; // 5 cm per planted step (acceptance)
const FOOT_FLOAT_LIMIT = 0.03; // 3 cm sink/float

/* Load the GLB and make the skin. data: an ArrayBuffer instead of fetching url (tests).
   It loads into an asset container, not the scene, so nothing of his is drawn while it streams in (no bare,
   untextured or bind-posed body at the origin): world.setSkin() puts him on, and only then is he in the scene.
   opts.extras: { name: ArrayBuffer } for Node checks that can't fetch models/clips/. */
export async function loadSmallWeather(world, url, data, opts = {}) {
  const B = window.BABYLON;
  const scene = world.scene;
  const container = await B.LoadAssetContainerAsync(data ? new Uint8Array(data) : url, scene, { pluginExtension: ".glb" });
  try {
    const extraGroups = await loadExtraClipGroups(B, scene, opts.extras || null);
    return makeSkin(B, scene, container, world.skinHips || 0.91, container, world, extraGroups);
  } catch (err) {
    container.dispose();
    throw err;
  }
}

async function loadExtraClipGroups(B, scene, extras) {
  const out = [];
  for (const name of EXTRA_CLIPS) {
    try {
      let payload = extras && extras[name];
      if (!payload && typeof fetch === "function") {
        const r = await fetch(`models/clips/${name}.glb`, { cache: "force-cache" });
        if (!r.ok) continue;
        payload = await r.arrayBuffer();
      }
      if (!payload) continue;
      const c = await B.LoadAssetContainerAsync(new Uint8Array(payload), scene, { pluginExtension: ".glb" });
      const g = c.animationGroups[0];
      if (!g) {
        c.dispose();
        continue;
      }
      g.name = name;
      g.stop();
      // Keep the container's Mixamo nodes (retargeted onto his bones in makeSkin). Hide the
      // one-triangle stand-in so it never draws or picks.
      c.meshes.forEach((m) => {
        m.isVisible = false;
        m.isPickable = false;
        m.setEnabled(false);
        if (m.getBoundingInfo) {
          m.getBoundingInfo = () => ({ boundingBox: { minimumWorld: { x: 0, y: 0, z: 0 }, maximumWorld: { x: 0, y: 0, z: 0 } }, boundingSphere: { centerWorld: { x: 0, y: 0, z: 0 }, radius: 0 } });
        }
      });
      c.addAllToScene();
      out.push({ group: g, container: c, name });
    } catch (err) {
      console.warn(`[small-weather] extra clip "${name}" skipped:`, err);
    }
  }
  return out;
}

/* Retarget an extra clip's AnimationGroup onto the skin's Mixamo transform nodes (same bone names). */
function retargetGroup(group, nodeByShort) {
  const short = (n) => (n || "").replace(/^.*:/, "");
  group.targetedAnimations.forEach((ta) => {
    const key = short(ta.target && ta.target.name);
    const dest = nodeByShort[key];
    if (dest) ta.target = dest;
  });
}

/* res: the loaded meshes, animationGroups and transformNodes (an AssetContainer or what ImportMeshAsync returned).
   hipsTarget: his hips' height standing, in world units (the figure's, 0.91m). container: when given, his parts join
   the scene only when the skin is put on (attach()). Until then the skin is hidden. */
export function makeSkin(B, scene, res, hipsTarget, container, world, extraGroups = []) {
  const glbRoot = res.meshes[0];
  const wrap = new B.TransformNode("small-weather", scene);
  wrap.setEnabled(false);
  /* With a container, __root__ is parented to the wrap only in attach(), after addAllToScene(): parenting it to a node
     outside the container makes Babylon warn "Asset Container hierarchy is not valid" and rebuild the hierarchy. */
  if (!container) glbRoot.parent = wrap;
  const meshes = res.meshes.filter((m) => m.getTotalVertices && m.getTotalVertices() > 0);
  /* __root__ has no vertices but parents the mesh; it stays enabled, so it counts as his */
  if (glbRoot && !meshes.includes(glbRoot)) meshes.unshift(glbRoot);
  const groups = res.animationGroups.slice();
  const named = (c) => groups.find((g) => g.name.toLowerCase() === c) || groups.find((g) => new RegExp(`(^|[^a-z])${c}([^a-z]|$)`, "i").test(g.name));

  /* Measure the mesh in bind/standing pose: feet sit at y ~ 0 and head at y ~ 1.75 m.
     Scale by actual standing height (~1.75 m -> scale ~1.0) rather than dividing 0.91 by Hips Y. */
  glbRoot.computeWorldMatrix(true);
  const bindBounds = glbRoot.getHierarchyBoundingVectors(true);
  const bindHeight = Math.max(1.0, bindBounds.max.y - bindBounds.min.y);
  const targetHeight = 1.75;
  const scale = targetHeight / bindHeight;
  wrap.scaling.setAll(scale);
  const footMin = Number.isFinite(bindBounds.min.y) ? bindBounds.min.y * scale : 0;

  /* Anchor wrap.position.y using the standing foot minimum so when me.root.position.y = feetY + 0.91
     (standing/walking/running/jumping/floating), his boots rest cleanly at feetY without per-clip hip bobbing.
     For seated/lying poses, account for world.js setting me.root.position.y = spec.y (0.63 for chairs) or tilting me.tilt. */
  const standAnchor = (hipsTarget || 0.91) + footMin;
  const seatAnchor = 0.53 + footMin; // spec.y (0.63) - seatAnchor (0.53) = 0.10 m floor height indoors
  const lieAnchor = 0.62 * scale; // places Hips near spin origin when me.tilt pitches -90 deg on the bed
  const reclineAnchor = 0.58 * scale;
  const clipAnchor = (c) => {
    if (c === "sit" || c === "type" || c === "window") return seatAnchor;
    if (c === "lie" || c === "side") return lieAnchor;
    if (c === "recline") return reclineAnchor;
    return standAnchor;
  };

  const nodes = res.transformNodes || [];
  const short = (n) => (n || "").replace(/^.*:/, "");
  const nodeByShort = {};
  nodes.forEach((n) => {
    nodeByShort[short(n.name)] = n;
  });
  // Also index meshes' skeleton bones' linked transform nodes
  meshes.forEach((m) => {
    if (!m.skeleton) return;
    m.skeleton.bones.forEach((b) => {
      const tn = b.getTransformNode && b.getTransformNode();
      if (tn) nodeByShort[short(tn.name || b.name)] = tn;
    });
  });

  extraGroups.forEach(({ group }) => {
    retargetGroup(group, nodeByShort);
    const baked = groups.findIndex((g) => g.name.toLowerCase() === group.name.toLowerCase());
    if (baked >= 0) {
      groups[baked].stop();
      groups.splice(baked, 1);
    }
    groups.push(group);
  });

  const player = clipAvatar(wrap, groups, { clips: SKIN_CLIPS, loops: LOOPS, walkStride: WALK_STRIDE, runStride: RUN_STRIDE });

  /* Emissive blue jacket seams & boot lights: use the embedded emissiveTexture in the GLB (or a tiny 128x128 fallback).
     Boost emissiveColor above the pipeline's HDR bloomThreshold (0.88) so seams and boots bloom natively without GlowLayer.
     Also set doNotSyncBoundingInfo = true so Babylon doesn't CPU-skin 22k vertices just to recompute bounding boxes. */
  const glowMeshes = [];
  meshes.forEach((m) => {
    if (m.skeleton) {
      m.doNotSyncBoundingInfo = true;
      /* The stale bind-pose bounds (and the wrap's scale, tilt and clip offsets) can fall outside the camera frustum
         while he is on screen: skip frustum culling for him, or he vanishes at certain camera angles. */
      m.alwaysSelectAsActiveMesh = true;
    }
    const mat = m.material;
    if (!mat) return;
    mat.maxSimultaneousLights = 6; // vertex UBO limit (14): see world.js mat()
    if ("usePhysicalLightFalloff" in mat) mat.usePhysicalLightFalloff = false;
    /* The GLB leaves metallicFactor at the glTF default of 1 and the scene has no environment map, so a fully
       metallic skin has nothing to reflect and draws solid black: make him cloth and skin, lit by the room. */
    if ("metallic" in mat) {
      mat.metallic = 0;
      mat.roughness = Math.max(mat.roughness == null ? 1 : mat.roughness, 0.8);
      mat.useRoughnessFromMetallicTextureGreen = false;
      mat.useMetallnessFromMetallicTextureBlue = false;
    }
    /* The occlusion map shares the metallic-roughness image, whose red channel is near 0 over most of the atlas
       (it reads cyan): it shades away the room's ambient light and leaves a dark jacket drawing black. */
    if ("ambientTexture" in mat) mat.ambientTexture = null;
    if (mat.albedoColor) mat.albedoColor = new B.Color3(1.6, 1.6, 1.6); // the navy, black and skin atlas is dark: lift it so it reads in a lamp-lit room
    if (mat.ambientColor) mat.ambientColor = new B.Color3(0.22, 0.24, 0.3);
    if (mat.emissiveTexture) {
      mat.emissiveColor = new B.Color3(0.75, 1.15, 1.35);
    } else {
      const albedo = mat.albedoTexture || mat.diffuseTexture;
      if (albedo && albedo.readPixels) emissiveFromBlue(B, scene, mat, albedo);
    }
  });

  const bolts = armLightning(B, scene, nodes);

  /* A soft fill on him alone (the city's lamps and sky go dark at dusk and in a storm, and the navy jacket drew a black
     silhouette): a cool light over his shoulder that touches only his own meshes, strongest when the sky light is low. */
  const fill = new B.PointLight("small-weather-fill", new B.Vector3(0.3, 1.2, -1.2), scene);
  fill.parent = wrap;
  fill.diffuse = new B.Color3(0.62, 0.74, 1);
  fill.specular = new B.Color3(0, 0, 0);
  fill.range = 9;
  fill.includedOnlyMeshes = meshes.slice();
  const skyLight = scene.getLightByName("sky");
  const updateFill = () => {
    const sky = skyLight ? Math.min(1, Math.max(0, (skyLight.intensity - 0.3) / 0.6)) : 0.5;
    fill.intensity = 2.2 * (1 - sky) + 0.4;
  };
  updateFill();

  /* Rim light: a cool key behind him toward the camera so the navy jacket reads against any sky. */
  const rim = new B.SpotLight(
    "small-weather-rim",
    new B.Vector3(0, 1.4, 0),
    new B.Vector3(0, -0.2, 1),
    Math.PI / 2.2,
    8,
    scene
  );
  rim.diffuse = new B.Color3(0.55, 0.85, 1.15);
  rim.specular = new B.Color3(0.15, 0.25, 0.35);
  rim.intensity = 1.6;
  rim.range = 6;
  rim.includedOnlyMeshes = meshes.slice();
  rim.setEnabled(false);

  const ik = makeFootIk(B, scene, nodeByShort, wrap, world, meshes);

  let offset = standAnchor;
  let clip = "idle";
  let idleClear = 0;
  let landT = 0;
  let landDepth = 0;
  let prevGrounded = true;
  let triumphLeft = 0;
  let ikWant = false;
  let ikLandK = 0;
  let ikSpeed = 0;
  let lastDt = 1 / 60;
  let heroEvt = "";
  const motion = {
    footSlideMax: 0,
    footFloatMax: 0,
    plantFails: 0,
    samples: 0,
    lookupPlayed: 0,
    windbolt: 0,
    windrain: 0,
    landings: 0,
    rimOn: false,
  };
  wrap.position.y = -offset;

  /* IK must run after the AnimationGroups evaluate bones (scene render), or it fights the clip quaternions.
     Skip entirely while a seated / lying clip is current so the day's sit bounds stay exact. */
  const SEATED_CLIPS = new Set(["sit", "type", "window", "lie", "side", "recline"]);
  const ikObs = scene.onAfterAnimationsObservable.add(() => {
    if (!wrap.isEnabled()) return;
    if (SEATED_CLIPS.has(clip)) {
      ik.reset();
      return;
    }
    if (ikWant) {
      const stats = ik.update(lastDt, { landK: ikLandK, speed: ikSpeed });
      motion.footSlideMax = Math.max(motion.footSlideMax, stats.slide);
      motion.footFloatMax = Math.max(motion.footFloatMax, stats.float);
      motion.samples++;
      if (stats.slide > FOOT_SLIDE_LIMIT || stats.float > FOOT_FLOAT_LIMIT) motion.plantFails++;
    } else {
      ik.reset();
    }
  });

  function readCtx() {
    const day = window.day;
    const st = day && day.control && day.control.state ? day.control.state() : null;
    const wx = day && day.weather && day.weather.now ? day.weather.now() : null;
    const cam = scene.activeCamera;
    let hour = 12;
    try {
      const fr = day && day.engine && day.engine.frame && day.watch && day.watch();
      if (fr && fr.clock != null) hour = fr.clock;
      else if (day && day.now) {
        const n = day.now();
        if (n && n.hour != null) hour = n.hour;
      }
    } catch (e) { /* ignore */ }
    return { st, wx, cam, hour, mine: !!(st && st.mode === "control") };
  }

  function pickHeroClip(want, ctx) {
    const { st, wx, hour } = ctx;
    if (triumphLeft > 0) return "triumph";
    if (landT > 0.18) return want; // keep locomotion; IK does the crouch
    // Distinct cast wind-ups while a power is winding
    // Trust powers.pose() / caller: windbolt and windrain stay as asked (don't remap a Lightning tap to rain).
    if (want === "windbolt" || want === "windrain") return named(want) ? want : "cast";
    if (want === "cast") {
      const pow = window.day && window.day.powers && window.day.powers.now ? window.day.powers.now() : null;
      const last = pow && pow.cast && (pow.cast.power || pow.cast.id);
      if (last === "lightning" || last === "storm" || last === "bolt") return named("windbolt") ? "windbolt" : "cast";
      if (last === "rain" || last === "fog" || last === "sun" || last === "gale" || last === "gust" || last === "tornado" || last === "wind") {
        return named("windrain") ? "windrain" : "cast";
      }
      return "cast";
    }
    if (want === "idle" && st && st.mode === "control" && st.grounded && st.speed < 0.15) {
      const raining = wx && (wx.rain > 0.25 || wx.state === "rain" || wx.state === "storm");
      if (raining && named("shelter")) return "shelter";
      const clear = wx && wx.state === "clear" && (wx.rain || 0) < 0.05;
      if (clear && idleClear > 4 && named("lookup")) return "lookup";
      if (!clear) idleClear = 0;
    } else if (want !== "lookup" && want !== "shelter") {
      idleClear = 0;
    }
    // Autopilot evening window sit: seated idle in evening hours becomes window
    if ((want === "sit" || want === "idle") && ctx.mine === false && hour >= 18.5 && hour < 22.5 && named("window")) {
      if (want === "sit") return "window";
    }
    return want;
  }

  return {
    kind: "small-weather",
    root: wrap,
    meshes,
    glowMeshes,
    boltMeshes: bolts.meshes,
    clips: SKIN_CLIPS.filter((c) => named(c)),
    clip: () => clip,
    motion: () => Object.assign({}, motion, ik.stats()),
    /* What his body is doing right now, in his own frame (+z forward, +x his left): how far the spine and neck lean
       from upright, the pelvis and shoulder lines' yaw, how far the knees bend, the hands' gap. The clip-poses playtest
       reads this on a real frame to flag a twisted torso, a hanging head or an arm through the body. */
    pose: () => bodyPose(B, wrap, nodeByShort),
    /* clip, ground speed (m/s), dt; mine: the player has him (the lightning shows) */
    play(c, speed, dt, mine) {
      const ctx = readCtx();
      if (mine == null) mine = ctx.mine;
      // Landing anticipation / recovery from hard impacts
      const grounded = ctx.st ? !!ctx.st.grounded : true;
      const vy = ctx.st && ctx.st.vy != null ? ctx.st.vy : 0;
      if (!prevGrounded && grounded && vy > -0.5) {
        // just landed; impact was in airTime — use softLand flag or speed
        const hard = ctx.st && (ctx.st.softLand === false) && (ctx.st.airTime > 0.35 || speed > 2);
        landDepth = hard ? 1 : 0.45;
        landT = hard ? 0.55 : 0.28;
        motion.landings++;
      }
      prevGrounded = grounded;
      if (landT > 0) landT = Math.max(0, landT - dt);

      // Triumph after a big cast (storm / tornado)
      try {
        const pow = window.day && window.day.powers && window.day.powers.now && window.day.powers.now();
        const id = pow && pow.cast && (pow.cast.power || pow.cast.id);
        if (id && (id === "storm" || id === "tornado") && pow.cast.age != null && pow.cast.age < 0.2) {
          triumphLeft = 1.2;
        }
      } catch (e) { /* ignore */ }
      if (triumphLeft > 0) triumphLeft = Math.max(0, triumphLeft - dt);

      if (c === "idle" && ctx.wx && ctx.wx.state === "clear" && (ctx.wx.rain || 0) < 0.05) idleClear += dt;
      else if (c !== "lookup") idleClear = Math.max(0, idleClear - dt * 0.5);

      let want = pickHeroClip(named(c) ? c : "idle", Object.assign(ctx, { mine }));
      // Force lookup once idleClear crosses the threshold
      if (want === "idle" && idleClear >= 4 && named("lookup") && mine) want = "lookup";
      clip = named(want) ? want : "idle";
      if (clip === "lookup") {
        motion.lookupPlayed++;
        if (heroEvt !== "lookup") {
          heroEvt = "lookup";
          try { window.dispatchEvent(new CustomEvent("day:hero", { detail: { action: "lookup" } })); } catch (e) { /* */ }
        }
      } else if (clip === "triumph") {
        if (heroEvt !== "triumph") {
          heroEvt = "triumph";
          try { window.dispatchEvent(new CustomEvent("day:hero", { detail: { action: "triumph" } })); } catch (e) { /* */ }
        }
      } else if (clip !== heroEvt) {
        heroEvt = clip;
      }
      if (clip === "windbolt") motion.windbolt++;
      if (clip === "windrain") motion.windrain++;

      updateFill();
      player.play(clip, speed, dt);
      offset = clipAnchor(clip);
      // Landing crouch dips the whole figure slightly (anticipation) then recovers
      const landK = landT > 0 ? Math.sin(Math.min(1, (0.55 - landT) / 0.2) * Math.PI) * landDepth * 0.06 : 0;
      wrap.position.y = -offset - landK;
      bolts.update(mine ? BOLTS[clip] || 0.2 : 0, dt);

      // Rim light: behind him, aimed at him from the camera's opposite side
      const cam = ctx.cam;
      if (cam && mine) {
        rim.setEnabled(true);
        motion.rimOn = true;
        const p = wrap.getAbsolutePosition();
        const toCam = cam.position.subtract(p);
        toCam.y = 0;
        if (toCam.lengthSquared() > 1e-4) toCam.normalize();
        else toCam.set(0, 0, -1);
        rim.position.copyFrom(p).addInPlaceFromFloats(-toCam.x * 1.6, 1.55, -toCam.z * 1.6);
        rim.direction.copyFrom(toCam);
        rim.direction.y = -0.25;
        rim.intensity = 1.35 + 0.4 * (1 - (skyLight ? Math.min(1, skyLight.intensity) : 0.5));
      } else {
        rim.setEnabled(false);
        motion.rimOn = false;
      }

      // Foot IK on grounded locomotion / idle (applied in onAfterAnimationsObservable)
      lastDt = Math.max(0.001, Math.min(0.05, dt || 1 / 60));
      ikLandK = landK;
      ikSpeed = speed || 0;
      ikWant = grounded && !["sit", "type", "window", "lie", "side", "recline", "jump", "fall", "float"].includes(clip);
    },
    show(on) {
      wrap.setEnabled(on);
      if (!on) {
        rim.setEnabled(false);
        ikWant = false;
      }
    },
    /* world.setSkin(): into the scene, then shown, once he is parented and placed */
    attach() {
      if (container) {
        container.addAllToScene();
        container = null;
        glbRoot.parent = wrap;
      }
      wrap.setEnabled(true);
      rim.setEnabled(false);
    },
    dispose() {
      try { scene.onAfterAnimationsObservable.remove(ikObs); } catch (e) { /* */ }
      try { rim.dispose(); } catch (e) { /* */ }
      try { fill.dispose(); } catch (e) { /* */ }
    },
  };
}

function bodyPose(B, wrap, byShort) {
  const inv = wrap.getWorldMatrix().clone().invert();
  const at = (n) => (byShort[n] ? B.Vector3.TransformCoordinates(byShort[n].getAbsolutePosition(), inv) : null);
  const P = {};
  ["Hips", "Neck", "Head", "LeftArm", "RightArm", "LeftHand", "RightHand", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot"].forEach((n) => (P[n] = at(n)));
  if (Object.values(P).some((v) => !v)) return null;
  const d = (a, b) => P[b].subtract(P[a]);
  const deg = (r) => (r * 180) / Math.PI;
  const bend = (a, b, c) => {
    const u = d(a, b);
    const v = d(b, c);
    return deg(Math.acos(Math.max(-1, Math.min(1, B.Vector3.Dot(u, v) / (u.length() * v.length() || 1)))));
  };
  const sp = d("Hips", "Head");
  const nk = d("Neck", "Head");
  const yaw = (a, b) => deg(Math.atan2(d(a, b).z, d(a, b).x));
  return {
    lean: deg(Math.atan2(sp.z, sp.y)),
    neck: deg(Math.atan2(nk.z, nk.y)),
    sideLean: deg(Math.atan2(sp.x, sp.y)),
    hipYaw: yaw("RightUpLeg", "LeftUpLeg"),
    shoulderYaw: yaw("RightArm", "LeftArm"),
    kneeL: bend("LeftUpLeg", "LeftLeg", "LeftFoot"),
    kneeR: bend("RightUpLeg", "RightLeg", "RightFoot"),
    handsApart: P.LeftHand.x - P.RightHand.x,
  };
}

/* Two-bone foot IK: raycast under each ankle, plant the boot, soft pelvis offset on slopes. */
function makeFootIk(B, scene, nodeByShort, wrap, world, meshes) {
  const hips = nodeByShort.Hips;
  const legs = ["Left", "Right"].map((side) => ({
    side,
    up: nodeByShort[side + "UpLeg"],
    mid: nodeByShort[side + "Leg"],
    foot: nodeByShort[side + "Foot"],
    toe: nodeByShort[side + "ToeBase"],
    plant: null,
    last: null,
  })).filter((L) => L.up && L.mid && L.foot);

  const ray = world && world.scene && world.scene.getPhysicsEngine && world.scene.getPhysicsEngine()
    ? new B.PhysicsRaycastResult()
    : null;
  let pelvisOff = 0; // last additive hips.y we applied on top of the clip
  const stats = { slide: 0, float: 0 };

  function groundY(x, y, z) {
    if (world && world.groundAt) {
      const g = world.groundAt(x, z, y + 0.6);
      if (g && g.y != null) return g.y;
    }
    if (world && world.surfaceAt) {
      const s = world.surfaceAt(x, z);
      if (s != null) return s;
    }
    // Havok plugin fallback
    try {
      const pl = scene.getPhysicsEngine && scene.getPhysicsEngine();
      const plugin = pl && pl.getPhysicsPlugin && pl.getPhysicsPlugin();
      if (plugin && plugin.raycast && ray) {
        plugin.raycast(new B.Vector3(x, y + 0.8, z), new B.Vector3(x, y - 1.2, z), ray);
        if (ray.hasHit) return ray.hitPointWorld.y;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function solveLeg(L, targetY, dt) {
    const footPos = L.foot.getAbsolutePosition();
    const upPos = L.up.getAbsolutePosition();
    const midPos = L.mid.getAbsolutePosition();
    const curY = footPos.y;
    const err = targetY - curY; // sole target vs ankle (boot ~2 cm is in targetY)
    if (Math.abs(err) < 0.004) return err;

    // Pitch the thigh and shin in their local X to raise/lower the foot (two-bone approximation).
    const thighLen = B.Vector3.Distance(upPos, midPos) || 0.4;
    const shinLen = B.Vector3.Distance(midPos, footPos) || 0.4;
    const reach = Math.max(0.05, Math.min(thighLen + shinLen - 0.02, Math.hypot(0.01, (upPos.y - targetY))));
    // Small local rotations: negative X lifts a Mixamo forward-facing leg's foot when err > 0 (foot too low).
    const k = Math.max(-0.35, Math.min(0.35, err * 1.6));
    const bend = Math.max(-0.5, Math.min(0.15, -err * 1.1));
    // Additive local X pitch after the clip's quaternion has been applied (onAfterAnimations).
    const pitch = (node, ang) => {
      if (!node || Math.abs(ang) < 1e-5) return;
      if (node.rotationQuaternion) {
        const dq = B.Quaternion.RotationAxis(B.Vector3.Right(), ang);
        node.rotationQuaternion.multiplyInPlace(dq);
      } else {
        node.rotation.x += ang;
      }
    };
    const step = Math.min(1, dt * 18);
    pitch(L.up, k * step);
    pitch(L.mid, bend * step);
    pitch(L.foot, (-err * 0.35) * Math.min(1, dt * 12));

    // Plant lock in XZ while this foot is the lower one (stance)
        const after = L.foot.getAbsolutePosition();
    // Residual float after the pitch correction (stance foot only).
    const residual = Math.abs(after.y - targetY);
    if (L.plant) stats.float = Math.max(stats.float, residual);
    if (L.plant && residual < 0.08) {
      const dx = after.x - L.plant.x;
      const dz = after.z - L.plant.z;
      const slide = Math.hypot(dx, dz);
      stats.slide = Math.max(stats.slide, slide);
      if (slide > 0.01 && hips) {
        // Nudge hips opposite the slide so the planted boot stays put
        const inv = wrap.getWorldMatrix().clone().invert();
        const pull = B.Vector3.TransformCoordinates(new B.Vector3(L.plant.x, after.y, L.plant.z), inv);
        const now = B.Vector3.TransformCoordinates(after, inv);
        hips.position.x += (pull.x - now.x) * 0.65;
        hips.position.z += (pull.z - now.z) * 0.65;
      }
    }
    return residual;
  }

  function clearPelvis(undo) {
    // When leaving IK, the next clip frame already overwrote hips — only drop the counter.
    // While IK is active, undo the additive delta before re-measuring the clip pose.
    if (undo && hips && Math.abs(pelvisOff) > 1e-5) hips.position.y -= pelvisOff;
    pelvisOff = 0;
  }

  return {
    stats: () => ({ slide: stats.slide, float: stats.float, pelvis: pelvisOff }),
    reset() {
      legs.forEach((L) => {
        L.plant = null;
        L.last = null;
      });
      clearPelvis(false);
      stats.slide = 0;
      stats.float = 0;
    },
    update(dt, ctx) {
      stats.slide = 0;
      stats.float = 0;
      if (!legs.length) return stats;
      // Undo last frame's pelvis so we measure feet from the pure clip pose.
      clearPelvis(true);
      const footYs = [];
      let errSum = 0;
      let errN = 0;
      legs.forEach((L) => {
        const fp = L.foot.getAbsolutePosition();
        const gy = groundY(fp.x, fp.y, fp.z);
        if (gy == null) {
          L.plant = null;
          return;
        }
        // Foot bone is the ankle; sole sits ~4 cm below it.
        const soleY = gy + 0.005;
        const ankleTarget = soleY + 0.04;
        footYs.push(soleY);
        errSum += ankleTarget - fp.y;
        errN++;
        const isLow = !L.last || fp.y <= (L.last.y + 0.01);
        if (isLow && Math.abs(fp.y - ankleTarget) < 0.14) {
          if (!L.plant) L.plant = { x: fp.x, z: fp.z };
        } else {
          L.plant = null;
        }
        L.last = { x: fp.x, y: fp.y, z: fp.z };
        solveLeg(L, ankleTarget - (ctx.landK || 0), dt);
      });

      // Soft pelvis lift from mean foot error (additive on top of the clip).
      if (hips && errN) {
        const mean = errSum / errN;
        const want = Math.max(-0.08, Math.min(0.1, mean * 0.55)) - (ctx.landK || 0) * 2.5;
        hips.position.y += want;
        pelvisOff = want;
      }
      meshes.forEach((m) => {
        if (m.skeleton) m.skeleton.prepare();
      });
      return stats;
    },
  };
}

/* Fallback emissive mask if not embedded in GLB: downsampled to 128x128 so zero multi-million-pixel CPU loops run. */
function emissiveFromBlue(B, scene, mat, albedo) {
  const go = () => {
    const size = albedo.getSize();
    const p = albedo.readPixels();
    if (!p || !size.width) return;
    Promise.resolve(p).then((px) => {
      if (!px) return;
      const w = Math.min(128, size.width);
      const h = Math.min(128, size.height);
      const out = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y++) {
        const sy = Math.floor((y / h) * size.height);
        for (let x = 0; x < w; x++) {
          const sx = Math.floor((x / w) * size.width);
          const si = (sy * size.width + sx) * 4;
          const di = (y * w + x) * 4;
          const r = px[si];
          const g = px[si + 1];
          const b = px[si + 2];
          const lit = b > 110 && b > r * 1.45 && b >= g * 0.95;
          const k = lit ? Math.min(1, (b - 90) / 120) : 0;
          out[di] = r * k;
          out[di + 1] = g * k;
          out[di + 2] = Math.min(255, b * k * 1.2);
          out[di + 3] = 255;
        }
      }
      const tex = new B.RawTexture(out, w, h, B.Engine.TEXTUREFORMAT_RGBA, scene, false, false, B.Texture.BILINEAR_SAMPLINGMODE);
      tex.coordinatesIndex = albedo.coordinatesIndex;
      mat.emissiveTexture = tex;
      mat.emissiveColor = new B.Color3(0.75, 1.15, 1.35);
    });
  };
  if (albedo.isReady()) go();
  else if (albedo.onLoadObservable) albedo.onLoadObservable.addOnce(go);
}

/* Lightning along each arm: a jagged thin tube from shoulder to fingertips, redrawn a dozen times a second. */
function armLightning(B, scene, nodes) {
  const find = (re) => nodes.find((n) => re.test(n.name));
  const sides = ["Left", "Right"]
    .map((s) => [find(new RegExp(`(^|:)${s}Arm$`)), find(new RegExp(`(^|:)${s}ForeArm$`)), find(new RegExp(`(^|:)${s}Hand$`))])
    .filter((c) => c.every(Boolean));
  const mat = new B.StandardMaterial("bolt", scene);
  mat.disableLighting = true;
  mat.emissiveColor = new B.Color3(0.85, 1.2, 1.45);
  const meshes = [];
  const bolts = sides.map((chain, i) => {
    const pts = new Array(9).fill(0).map(() => new B.Vector3());
    const mesh = B.MeshBuilder.CreateTube(`bolt${i}`, { path: pts, radius: 0.01, tessellation: 4, updatable: true }, scene);
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.setEnabled(false);
    meshes.push(mesh);
    return { chain, pts, mesh };
  });
  /* Compile the bolt's shader now: its first draw is the frame he first becomes the player's (a mid-play hitch). */
  if (mat.forceCompilationAsync && meshes[0]) mat.forceCompilationAsync(meshes[0]).catch(() => {});
  let t = 0;
  let level = 0;
  return {
    meshes,
    update(want, dt) {
      level += (want - level) * (1 - Math.exp(-8 * dt));
      t += dt;
      const on = level > 0.05;
      bolts.forEach((b) => b.mesh.setEnabled(on));
      if (!on || t < 0.08) return;
      t = 0;
      mat.alpha = Math.min(1, level * 1.4);
      bolts.forEach((b) => {
        if (Math.random() > 0.35 + level) {
          b.mesh.visibility = 0;
          return;
        }
        b.mesh.visibility = 1;
        const [a, f, h] = b.chain.map((n) => n.getAbsolutePosition());
        const span = B.Vector3.Distance(a, h);
        const jag = 0.035 + 0.05 * level;
        b.pts.forEach((p, k) => {
          const u = k / (b.pts.length - 1);
          const base = u < 0.5 ? B.Vector3.Lerp(a, f, u * 2) : B.Vector3.Lerp(f, h, (u - 0.5) * 2);
          const j = k === 0 ? 0 : jag * (k === b.pts.length - 1 ? 2.2 : 1) * Math.max(0.3, span);
          p.set(base.x + (Math.random() - 0.5) * j, base.y + (Math.random() - 0.5) * j, base.z + (Math.random() - 0.5) * j);
        });
        B.MeshBuilder.CreateTube(null, { path: b.pts, radius: 0.008 + 0.01 * level, instance: b.mesh });
      });
    },
  };
}
