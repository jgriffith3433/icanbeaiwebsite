/* ==========================================================================
   Small Weather's 3D model: the rigged GLB from Hawkes Gen (hawkes.assets.json,
   models/small-weather.glb), worn over the box-built figure of js/world.js.

   The figure stays as the frame (the day and the controller place, tilt and seat
   it); its boxes hide and the model plays the clip that fits: idle, walk, run,
   jump, fall, float, cast and throw for the player, and the day's own (sit,
   type, phone, lie, side, recline). world.setSkin() puts it on.

   On top of the GLB's texture: the jacket's seams and the boots glow blue (the
   bright blue of the texture becomes emissive, in the glow layer), and while
   he's the player's, lightning coils his arms, strongest when he casts.

   day.config.js `control.model` is the GLB's path; null = the box figure.
   ========================================================================== */
import "@babylonjs/loaders/glTF/index.js"; // registers the .glb loader
import { clipAvatar } from "./avatar.js";

export const SKIN_CLIPS = ["idle", "walk", "run", "jump", "fall", "float", "cast", "throw", "sit", "type", "phone", "lie", "side", "recline"];
const LOOPS = ["idle", "walk", "run", "fall", "float", "sit", "type", "phone", "lie", "side", "recline"];

/* How much lightning each clip has while he's the player's (0 on his day) */
const BOLTS = { cast: 1, throw: 1, float: 0.7, fall: 0.5, jump: 0.5, idle: 0.3, walk: 0.25, run: 0.35 };

/* Load the GLB into the world's scene and make the skin. data: an ArrayBuffer instead of fetching url (tests). */
export async function loadSmallWeather(world, url, data) {
  const B = window.BABYLON;
  const scene = world.scene;
  const res = await B.ImportMeshAsync(data ? new Uint8Array(data) : url, scene, { pluginExtension: ".glb" });
  return makeSkin(B, scene, res, world.skinHips || 0.91);
}

/* res: what ImportMeshAsync returned. hipsTarget: his hips' height standing, in world units (the figure's, 0.91m). */
export function makeSkin(B, scene, res, hipsTarget) {
  const glbRoot = res.meshes[0];
  const wrap = new B.TransformNode("small-weather", scene);
  glbRoot.parent = wrap;
  const meshes = res.meshes.filter((m) => m.getTotalVertices && m.getTotalVertices() > 0);
  /* __root__ has no vertices but parents the mesh; it stays enabled, so it counts as his */
  if (glbRoot && !meshes.includes(glbRoot)) meshes.unshift(glbRoot);
  const groups = res.animationGroups;
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
    if (c === "sit" || c === "type") return seatAnchor;
    if (c === "lie" || c === "side") return lieAnchor;
    if (c === "recline") return reclineAnchor;
    return standAnchor;
  };

  const player = clipAvatar(wrap, groups, { clips: SKIN_CLIPS, loops: LOOPS, walkStride: 1.25, runStride: 2.4 });

  /* Emissive blue jacket seams & boot lights: use the embedded emissiveTexture in the GLB (or a tiny 128x128 fallback).
     Do NOT add the 39k-tri skinned mesh to GlowLayer (only lightweight arm bolt tubes go into GlowLayer). */
  const glowMeshes = [];
  meshes.forEach((m) => {
    const mat = m.material;
    if (!mat) return;
    mat.maxSimultaneousLights = 10;
    if ("usePhysicalLightFalloff" in mat) mat.usePhysicalLightFalloff = false;
    if (mat.ambientColor) mat.ambientColor = new B.Color3(0.22, 0.24, 0.3);
    if (mat.emissiveTexture) {
      mat.emissiveColor = new B.Color3(0.55, 0.85, 1.0);
    } else {
      const albedo = mat.albedoTexture || mat.diffuseTexture;
      if (albedo && albedo.readPixels) emissiveFromBlue(B, scene, mat, albedo);
    }
  });

  const nodes = res.transformNodes || [];
  const bolts = armLightning(B, scene, nodes);

  let offset = standAnchor;
  let clip = "idle";
  wrap.position.y = -offset;
  return {
    kind: "small-weather",
    root: wrap,
    meshes,
    glowMeshes,
    boltMeshes: bolts.meshes,
    clips: SKIN_CLIPS.filter((c) => named(c)),
    clip: () => clip,
    /* clip, ground speed (m/s), dt; mine: the player has him (the lightning shows) */
    play(c, speed, dt, mine) {
      clip = named(c) ? c : "idle";
      player.play(clip, speed, dt);
      offset = clipAnchor(clip);
      wrap.position.y = -offset;
      bolts.update(mine ? BOLTS[clip] || 0.2 : 0, dt);
    },
    show(on) {
      wrap.setEnabled(on);
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
      mat.emissiveColor = new B.Color3(0.55, 0.85, 1.0);
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
  mat.emissiveColor = new B.Color3(0.55, 0.85, 1.0);
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
