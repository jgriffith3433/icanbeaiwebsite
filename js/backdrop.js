/* ==========================================================================
   The far city: a skyline silhouette ring that keeps the horizon from reading as one flat band, on every quality setting.

   The real skyline towers (js/cityscape.js) sit 130-230 m out and the fog eats them: at dusk, and on a phone, they melt into the
   horizon colour. This ring is one open cylinder (r 470 m, inside the sky dome's 550 and camera.maxZ 600) with ONE baked 2048x256
   canvas (two ranks of towers, stepped tops, antennas) used as an alpha mask. Its colour is the scene's horizon (fog) colour pulled
   darker and cooler, so it follows the hour (dawn, day, dusk, night) and the weather for free, never fogged, never lit.
   Cost: one draw call, no per-frame texture work, no GPU assets. Imported after sky.js.
   `day.backdrop.info()`: { on, quality, colour, horizon, contrast, towers }.
   ========================================================================== */
const W = 2048;
const H = 256;
const R = 470;
const HEIGHT = 120; // metres of mask: the tallest tower tops out at ~60% of it, about 9 degrees up from the ground at 470 m

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pure: the tower list for a rank (x, width, height 0..1), wrapping seamlessly (last block's height equals the first's). */
export function towersFor(seed, minW, maxW, minH, maxH, width = W) {
  const rnd = mulberry(seed);
  const out = [];
  let x = 0;
  while (x < width) {
    const w = Math.min(width - x, Math.round(minW + rnd() * (maxW - minW)));
    const tall = rnd() < 0.18;
    const h = minH + (maxH - minH) * (tall ? 0.7 + rnd() * 0.3 : rnd() * rnd());
    out.push({ x, w, h, step: rnd() < 0.35, mast: tall && rnd() < 0.6 });
    x += w;
  }
  if (out.length > 1) out[out.length - 1].h = out[0].h;
  return out;
}

/** Pure: silhouette colour from the horizon colour (0..1 rgb): darker and cooler, enough contrast to read at every hour. */
export function silhouetteOf(h) {
  const lum = 0.3 * h[0] + 0.59 * h[1] + 0.11 * h[2];
  const k = 0.52 - 0.12 * Math.min(1, lum * 1.6); // brighter horizons get a deeper silhouette
  return [h[0] * k * 0.92, h[1] * k * 0.98, Math.min(1, h[2] * k * 1.1 + 0.015)];
}

export function installBackdrop(world) {
  if (!world || !world.scene) return null;
  const B = window.BABYLON;
  const scene = world.scene;
  if (scene.metadata && scene.metadata.dayBackdrop) return scene.metadata.dayBackdrop;
  const engine = world.engine;
  const look = world.look;
  const st = { on: false, towers: 0, colour: [0, 0, 0], horizon: [0, 0, 0], contrast: 0 };
  const api = {
    info() {
      return {
        on: st.on,
        quality: look && look.quality ? look.quality() : "high",
        colour: st.colour.map((v) => Number(v.toFixed(3))),
        horizon: st.horizon.map((v) => Number(v.toFixed(3))),
        contrast: Number(st.contrast.toFixed(3)),
        towers: st.towers,
      };
    },
  };
  scene.metadata = scene.metadata || {};
  scene.metadata.dayBackdrop = api;
  world.backdrop = api;
  if (window.day) window.day.backdrop = api;
  if (!engine || engine.getClassName() === "NullEngine" || typeof document === "undefined") return api;

  const tex = new B.DynamicTexture("backdropMask", { width: W, height: H }, scene, false);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  const ranks = [
    { towers: towersFor(7101, 40, 120, 0.12, 0.5), alpha: 0.78 }, // the far rank, a little lighter
    { towers: towersFor(7102, 34, 96, 0.1, 0.62), alpha: 1 },
  ];
  ranks.forEach((rank) => {
    ctx.globalAlpha = rank.alpha;
    rank.towers.forEach((t) => {
      const top = H - Math.round(t.h * H);
      ctx.fillRect(t.x, top, t.w, H - top);
      if (t.step) ctx.fillRect(t.x + Math.round(t.w * 0.2), top - Math.round(H * 0.05), Math.round(t.w * 0.6), Math.round(H * 0.05) + 1);
      if (t.mast) ctx.fillRect(t.x + Math.round(t.w / 2) - 1, top - Math.round(H * 0.13), 3, Math.round(H * 0.13) + 1);
    });
    st.towers += rank.towers.length;
  });
  ctx.globalAlpha = 1;
  tex.hasAlpha = true;
  tex.wrapU = B.Texture.WRAP_ADDRESSMODE;
  tex.wrapV = B.Texture.CLAMP_ADDRESSMODE;
  tex.update(true);

  const mat = new B.StandardMaterial("backdrop", scene);
  mat.disableLighting = true;
  mat.diffuseColor = new B.Color3(0, 0, 0);
  mat.specularColor = new B.Color3(0, 0, 0);
  mat.emissiveColor = new B.Color3(0.1, 0.12, 0.16);
  mat.opacityTexture = tex;
  mat.opacityTexture.getAlphaFromRGB = false;
  mat.backFaceCulling = false;
  mat.fogEnabled = false;
  mat.disableDepthWrite = true;
  mat.alphaMode = B.Engine.ALPHA_COMBINE;

  const ring = B.MeshBuilder.CreateCylinder("far-city-backdrop", { diameter: R * 2, height: HEIGHT, tessellation: 48, cap: B.Mesh.NO_CAP }, scene);
  ring.material = mat;
  ring.isPickable = false;
  ring.applyFog = false;
  ring.alwaysSelectAsActiveMesh = true;
  ring.doNotSyncBoundingInfo = true;
  ring.renderingGroupId = 0;
  ring.alphaIndex = 1;
  ring.receiveShadows = false;
  ring.metadata = { sky: true, backdrop: true };
  st.on = true;

  scene.onBeforeRenderObservable.add(() => {
    const cam = scene.activeCamera;
    if (!cam) return;
    // it stands on the ground (4 m under y 0, hidden by the base plane) and follows the camera in x and z
    ring.position.set(cam.position.x, HEIGHT / 2 - 4, cam.position.z);
    const h = [scene.fogColor.r, scene.fogColor.g, scene.fogColor.b];
    const c = silhouetteOf(h);
    mat.emissiveColor.set(c[0], c[1], c[2]);
    st.colour = c;
    st.horizon = h;
    st.contrast = Math.abs(0.3 * (h[0] - c[0]) + 0.59 * (h[1] - c[1]) + 0.11 * (h[2] - c[2]));
  });
  return api;
}

const live = typeof window !== "undefined" && window.day && window.day.world && window.day.world();
if (live) installBackdrop(live);
