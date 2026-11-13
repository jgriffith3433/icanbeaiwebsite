/* ==========================================================================
   The sky: painted panoramas, a cloud deck, god rays and the sky's reflections.
   Imported after render-pipeline.js; it hangs off the dome and material js/look.js builds (`look.skyDome`, `look.skyMat`).

   - Six painted equirect panoramas (textures/sky/sky-<id>.webp, Hawkes Gen image.panorama, recipes sky-* in hawkes.assets.json):
     dawn, noon, golden hour, dusk, night (stars and the moon) and a storm shelf cloud. The day's clock crossfades the first five
     (`timeWeights`, js/sky-core.js), the weather's cover brings in the storm one. Each is fetched when it first has weight, so a
     phone only pulls the skies it sees; until one is in, the procedural dome shows (`panoOn`). Twinkling stars are laid on top.
   - A cloud deck over the city: 2 noise-scrolled planes on low quality, one raymarched slab on high. Storm and Lightning thicken
     and darken it; each strike lights it from inside (held 4 frames, so a 30 fps phone sees at least 3); Sun break tears a gap in
     it with a ragged edge.
   - God rays: a VolumetricLightScatteringPostProcess from a sun disc in the gap, only on high quality and only while the gap is
     open (created lazily, disposed after it has been shut a while). Low quality never builds it.
   - Reflections: a ReflectionProbe of the dome becomes scene.environmentTexture, refreshed every second or three, so PBR and glass
     reflect the current sky.
   `day.sky.info()` (the playtest reads it): panos, weights, painted, gap, godRays, deck, ibl.
   ========================================================================== */
import { PANOS, panoWeights, deckFlashStep, deckStrike, gapOpen } from "./sky-core.js";

const B = window.BABYLON;
const DECK_R = 520; // metres: inside camera.maxZ (600) at the rim, faded out before it
const DECK_H = 250; // the high slab's middle; the low planes sit at DECK_H - 30 and DECK_H + 40
const SLAB = 70;

const DECK_VERT = `
  precision highp float;
  attribute vec3 position;
  uniform mat4 world;
  uniform mat4 viewProjection;
  varying vec3 vW;
  void main() {
    vec4 w = world * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = viewProjection * w;
  }`;

const deckFrag = (march) => `
  precision highp float;
  varying vec3 vW;
  uniform vec3 camPos;
  uniform vec4 cA;   // cover, storm, flash, time
  uniform vec4 cB;   // gap open, hole direction x, y, z
  uniform vec3 lit;  // the light the clouds catch (the hour's and the weather's)
  uniform vec4 cC;   // scale, scroll, layer alpha, seed
  float hash2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float noise2(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.5 * noise2(p);
    v += 0.28 * noise2(p * 2.07 + vec2(3.7, 1.9));
    ${march ? "v += 0.14 * noise2(p * 4.3 + vec2(7.1, 5.3));" : ""}
    ${march ? "v += 0.08 * noise2(p * 8.9 + vec2(1.3, 9.2));" : ""}
    return ${march ? "v" : "v * 1.22"}; // the phone's planes keep two octaves (the third and fourth are the raymarch's), rescaled so the cover reads the same
  }
  float dens(vec2 xz, float t) {
    vec2 p = xz * cC.x * 0.0032 + vec2(t * cC.y, t * cC.y * 0.42) + cC.w;
    float thr = mix(0.62, 0.30, cA.x);
    return smoothstep(thr, thr + 0.26, fbm(p));
  }
  void main() {
    vec3 ray = vW - camPos;
    vec3 rd = normalize(ray);
    if (rd.y < 0.015) discard;
    float rad = length(ray.xz) / ${DECK_R.toFixed(1)};
    float edge = smoothstep(1.0, 0.7, rad) * smoothstep(0.015, 0.2, rd.y);
    float t = cA.w;
    // the Sun break's gap: a ragged hole around the direction it was cast in
    float g = 0.0;
    if (cB.x > 0.001) {
      float ang = acos(clamp(dot(rd, cB.yzw), -1.0, 1.0));
      float rag = (fbm(vW.xz * 0.011 + t * 0.03) - 0.4) * 0.34;
      float R = 0.52 * cB.x;
      g = 1.0 - smoothstep(R * 0.5, R, ang + rag);
    }
    float strike = cA.z;
    vec3 flashCol = vec3(0.62, 0.78, 1.0);
    vec3 col;
    float a;
    ${march ? `
    float yb = vW.y - ${(SLAB / 2).toFixed(1)};
    float tb = (yb - camPos.y) / rd.y;
    float tt = (yb + ${SLAB.toFixed(1)} - camPos.y) / rd.y;
    float trans = 1.0;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      float f = (float(i) + 0.5) / 6.0;
      vec3 pos = camPos + rd * mix(tb, tt, f);
      float prof = smoothstep(0.0, 0.3, f) * smoothstep(1.0, 0.55, f);
      float d = dens(pos.xz, t) * prof;
      float sh = mix(0.42, 1.0, f) * (1.0 - cA.y * 0.55);
      vec3 c = lit * sh + flashCol * strike * (1.5 - f) * 1.9; // lit from inside: the glow is strongest low in the slab
      float k = d * 0.9;
      acc += c * k * trans;
      trans *= exp(-k * 1.15);
    }
    a = (1.0 - trans);
    col = acc / max(1.0 - trans, 0.001);
    ` : `
    float d = dens(vW.xz, t);
    col = lit * (0.62 + 0.38 * d) * (1.0 - cA.y * 0.5) + flashCol * strike * d * 1.5;
    a = d;
    `}
    a *= mix(0.5, 0.98, cA.x) * cC.z * edge * (1.0 - g);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }`;

export function installSky(world) {
  if (!world || !world.scene || !world.look) return null;
  const scene = world.scene;
  const look = world.look;
  if (scene.metadata && scene.metadata.daySky) return scene.metadata.daySky;
  const engine = world.engine;
  const cfg = (window.DAY_CONFIG && window.DAY_CONFIG.sky) || {};
  const parse = (s, d) => (window.DayEngine ? window.DayEngine.parseClock(s || d) / 60 : (d === "7:05" ? 7.083 : 18.416));
  const sunrise = parse(cfg.sunrise, "7:05");
  const sunset = parse(cfg.sunset, "18:25");
  const files = cfg.panoramas || {}; // { dawn: "textures/sky/sky-dawn.webp", ... } set once the files are in the repo

  const st = {
    enabled: false,
    weights: { dawn: 0, noon: 1, golden: 0, dusk: 0, night: 0, storm: 0 },
    loaded: {}, loading: {}, tex: {},
    painted: 0,
    gap: 0, hole: new B.Vector3(0, 0.6, 0.8),
    deck: { v: 0, hold: 0, strikes: 0, litFrames: 0, run: 0, lastRun: 0, minRun: 0, lastStrikeAt: 0 },
    god: { post: null, closedFor: 0, made: 0, active: false },
    ibl: { probe: null, size: 0, refreshes: 0, sinceRefresh: 99 },
    quality: look.quality(),
  };
  const api = {
    info() {
      return {
        enabled: st.enabled,
        files: Object.keys(files).filter((k) => files[k]),
        loaded: PANOS.filter((k) => st.loaded[k]),
        weights: Object.assign({}, st.weights),
        painted: Number(st.painted.toFixed(3)),
        gap: Number(st.gap.toFixed(3)),
        hole: { x: Number(st.hole.x.toFixed(3)), y: Number(st.hole.y.toFixed(3)), z: Number(st.hole.z.toFixed(3)) },
        godRays: { on: st.god.active, made: st.god.made, supported: !!st.god.supported },
        deck: {
          layers: st.layers ? st.layers.filter((m) => m.isEnabled()).length : 0,
          mode: st.quality === "low" ? "planes" : "raymarch",
          flash: Number(st.deck.v.toFixed(3)),
          strikes: st.deck.strikes,
          litFrames: st.deck.lastRun,
          minLitFrames: st.deck.minRun,
        },
        ibl: { on: !!(st.ibl.probe && scene.environmentTexture === st.ibl.probe.cubeTexture), size: st.ibl.size, refreshes: st.ibl.refreshes },
        quality: st.quality,
      };
    },
    weightsAt: (hour, cover = 0) => panoWeights(hour, sunrise, sunset, cover),
    /** Playtest: hold the hole's centre in front of the camera, as a cast does. */
    strikeDeck() { deckStrike(st.deck); },
  };
  scene.metadata = scene.metadata || {};
  scene.metadata.daySky = api;
  world.sky = api;
  if (window.day) window.day.sky = api;

  const dome = look.skyDome;
  const skyMat = look.skyMat;
  if (!dome || !skyMat || engine.getClassName() === "NullEngine") return api; // no picture here (the checks run headless)
  st.enabled = true;

  /* ---- the painted skies ---- */
  const placeholder = B.RawTexture.CreateRGBATexture(new Uint8Array([24, 34, 58, 255]), 1, 1, scene, false, false, B.Texture.NEAREST_SAMPLINGMODE);
  PANOS.forEach((id, i) => skyMat.setTexture("pano" + i, placeholder));
  function want(id) {
    if (!files[id] || st.loaded[id] || st.loading[id]) return;
    st.loading[id] = true;
    const t = new B.Texture(files[id], scene, true /* noMipmap */, true, B.Texture.BILINEAR_SAMPLINGMODE, () => {
      t.wrapU = B.Texture.WRAP_ADDRESSMODE;
      t.wrapV = B.Texture.CLAMP_ADDRESSMODE;
      st.tex[id] = t;
      skyMat.setTexture("pano" + PANOS.indexOf(id), t);
      st.loaded[id] = true;
    }, () => { st.loading[id] = false; st.failed = (st.failed || 0) + 1; });
  }
  const aVec = new B.Vector3();
  const bVec = new B.Vector3();
  const onVec = new B.Vector2(0, cfg.yaw || 0);

  /* ---- the cloud deck ---- */
  const camPos = new B.Vector3();
  const litVec = new B.Vector3(0.9, 0.93, 1);
  const cA = new B.Vector4(0, 0, 0, 0);
  const cB = new B.Vector4(0, 0, 0.6, 0.8);
  const LIT = { dawn: [1, 0.78, 0.74], noon: [0.95, 0.97, 1], golden: [1, 0.72, 0.42], dusk: [0.86, 0.5, 0.46], night: [0.13, 0.17, 0.3], storm: [0.3, 0.34, 0.42] };
  function makeDeck(name, march, h, scale, scroll, alpha, seed) {
    const mat = new B.ShaderMaterial(name, scene, { vertexSource: DECK_VERT, fragmentSource: deckFrag(march) }, {
      attributes: ["position"],
      uniforms: ["world", "viewProjection", "camPos", "cA", "cB", "lit", "cC"],
      needAlphaBlending: true,
    });
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    mat.alphaMode = B.Engine.ALPHA_COMBINE;
    mat.setVector4("cC", new B.Vector4(scale, scroll, alpha, seed));
    const m = B.MeshBuilder.CreateDisc(name, { radius: DECK_R, tessellation: 48 }, scene);
    m.rotation.x = Math.PI / 2;
    m.position.y = h;
    m.material = mat;
    m.isPickable = false;
    m.applyFog = false;
    m.alphaIndex = 5;
    m.renderingGroupId = 0;
    m.doNotSyncBoundingInfo = true;
    m.alwaysSelectAsActiveMesh = true;
    m.setEnabled(false);
    m.metadata = { sky: true };
    return m;
  }
  const deckHigh = makeDeck("cloudDeckHigh", true, DECK_H, 1.0, 0.012, 1, 0);
  const deckLow1 = makeDeck("cloudDeckLow1", false, DECK_H - 30, 1.0, 0.012, 0.9, 0);
  const deckLow2 = makeDeck("cloudDeckLow2", false, DECK_H + 40, 0.62, 0.02, 0.7, 11.3);
  st.layers = [deckHigh, deckLow1, deckLow2];
  function setQuality() {
    st.quality = look.quality();
    const low = st.quality === "low";
    deckHigh.setEnabled(!low);
    deckLow1.setEnabled(low);
    deckLow2.setEnabled(low);
    ensureProbe();
  }

  /* ---- god rays ---- */
  const sunDisc = B.MeshBuilder.CreatePlane("godSun", { size: 90 }, scene);
  sunDisc.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
  sunDisc.isPickable = false;
  sunDisc.applyFog = false;
  sunDisc.alphaIndex = 20;
  const sunMat = new B.StandardMaterial("godSunMat", scene);
  sunMat.disableLighting = true;
  sunMat.emissiveColor = new B.Color3(1, 0.92, 0.7);
  sunMat.backFaceCulling = false;
  sunMat.disableDepthWrite = true;
  const glow = new B.DynamicTexture("godSunTex", { width: 128, height: 128 }, scene, false);
  {
    const c = glow.getContext();
    const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,250,230,1)");
    gr.addColorStop(0.18, "rgba(255,236,190,0.95)");
    gr.addColorStop(0.5, "rgba(255,200,130,0.28)");
    gr.addColorStop(1, "rgba(255,190,120,0)");
    c.fillStyle = gr;
    c.fillRect(0, 0, 128, 128);
    glow.hasAlpha = true;
    glow.update();
  }
  sunMat.emissiveTexture = glow;
  sunMat.opacityTexture = glow;
  sunDisc.material = sunMat;
  sunDisc.setEnabled(false);
  st.god.supported = !!B.VolumetricLightScatteringPostProcess;
  /* The gap's rim for the rays: a flat ring at the deck's height with a hole where the gap is. The god-ray pass draws every mesh
     it sees as black, so this is what the sun's light has to get through. In the picture itself it is fully transparent (alpha 0). */
  const ceiling = (() => {
    const seg = 40;
    const pos = [];
    const idx = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pos.push(Math.cos(a), 0, Math.sin(a), Math.cos(a) * 60, 0, Math.sin(a) * 60);
    }
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      idx.push(i * 2, i * 2 + 1, j * 2, j * 2, i * 2 + 1, j * 2 + 1);
    }
    const m = new B.Mesh("godCeiling", scene);
    const vd = new B.VertexData();
    vd.positions = pos;
    vd.indices = idx;
    vd.applyToMesh(m);
    const mat = new B.StandardMaterial("godCeilingMat", scene);
    mat.alpha = 0;
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    m.material = mat;
    m.isPickable = false;
    m.alwaysSelectAsActiveMesh = true;
    m.setEnabled(false);
    return m;
  })();

  function godRaysOn(on) {
    const cam = scene.activeCamera;
    if (on && !st.god.post && cam && st.god.supported) {
      try {
        const p = new B.VolumetricLightScatteringPostProcess("godrays", 0.5, cam, sunDisc, 48, B.Texture.BILINEAR_SAMPLINGMODE, engine, false);
        p.exposure = 0.0;
        p.decay = 0.965;
        p.weight = 0.52;
        p.density = 0.92;
        // the deck and the dome are not occluders (they would shut the disc out); the buildings and the gap's rim are
        (p.excludedMeshes = p.excludedMeshes || []).push(dome, deckHigh, deckLow1, deckLow2);
        // (the ring `ceiling` and the buildings are the occluders)
        st.god.post = p;
        st.god.made++;
      } catch (e) {
        st.god.supported = false;
      }
    }
    if (!on && st.god.post) {
      try { st.god.post.dispose(scene.activeCamera); } catch (e) { /* already gone */ }
      st.god.post = null;
    }
    st.god.active = !!st.god.post;
  }

  /* Warm the god-ray pass once, early (title screen / first seconds), then drop it. Its post and occluder shaders compile on the
     first frame they run; built for the first time at a Sun break that was a ~1.5 s stall mid-play. Babylon caches the compiled
     effects, so the real build later is cheap. Exposure 0 and the disc off: nothing shows while it warms. */
  if (st.god.supported && st.quality !== "low") {
    setTimeout(() => {
      if (st.god.post || st.quality === "low" || !scene.activeCamera) return;
      godRaysOn(true);
      const warm = st.god.post;
      if (!warm) return;
      let n = 0;
      const obs = scene.onAfterRenderObservable.add(() => {
        if (++n < 12) return;
        scene.onAfterRenderObservable.remove(obs);
        if (st.god.post === warm && st.gap <= 0.04) godRaysOn(false);
      });
    }, 4000);
  }

  /* ---- reflections of the sky ---- */
  function ensureProbe() {
    const size = st.quality === "low" ? 32 : 64;
    if (st.ibl.probe && st.ibl.size === size) return;
    if (st.ibl.probe) { if (scene.environmentTexture === st.ibl.probe.cubeTexture) scene.environmentTexture = null; st.ibl.probe.dispose(); }
    try {
      const p = new B.ReflectionProbe("skyProbe", size, scene, true);
      p.renderList.push(dome);
      p.refreshRate = B.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
      scene.environmentTexture = p.cubeTexture;
      st.ibl.probe = p;
      st.ibl.size = size;
      st.ibl.sinceRefresh = 99;
    } catch (e) { st.ibl.probe = null; }
  }

  /* ---- events ---- */
  window.addEventListener("day:strike", (e) => {
    const a = e.detail && e.detail.action;
    if (a === "strike" || a === "restrike") {
      deckStrike(st.deck);
      if (a === "strike") { st.deck.strikes++; st.deck.run = 0; st.deck.minRun = 0; }
    }
  });
  window.addEventListener("day:quality", setQuality);
  setQuality();

  let t = 0;
  let lastFlashIn = 0;
  scene.onBeforeRenderObservable.add(() => {
    const cam = scene.activeCamera;
    if (!cam) return;
    const dt = Math.min(0.1, (engine.getDeltaTime ? engine.getDeltaTime() : 16) * 0.001);
    t += dt;
    const ov = look.override() || {};
    const cover = ov.cover != null ? ov.cover : 0;
    const storm = ov.storm != null ? ov.storm : 0;
    const flashIn = ov.flash != null ? ov.flash : 0;
    if (flashIn > 0.6 && lastFlashIn <= 0.6) deckStrike(st.deck); // the forecast's own storm flashes light the deck too
    lastFlashIn = flashIn;
    const sun = ov.sun != null ? ov.sun : 0;

    // which painted skies, and how many of them are in
    const now = window.day && window.day.now && window.day.now();
    const hour = now && typeof now.minutes === "number" ? (((now.minutes % 1440) + 1440) % 1440) / 60 : 12;
    const w = panoWeights(hour, sunrise, sunset, cover);
    st.weights = w;
    let have = 0;
    PANOS.forEach((id) => { if (w[id] > 0.001) { want(id); if (st.loaded[id]) have += w[id]; } });
    const target = have > 0.5 ? 1 : have * 2;
    st.painted += (target - st.painted) * (1 - Math.exp(-dt * 3));
    const k = have > 0.001 ? 1 / have : 0;
    const eff = (id) => (st.loaded[id] ? w[id] * k : 0);
    aVec.set(eff("dawn"), eff("noon"), eff("golden"));
    bVec.set(eff("dusk"), eff("night"), eff("storm"));
    onVec.x = st.painted;
    skyMat.setVector3("panoA", aVec);
    skyMat.setVector3("panoB", bVec);
    skyMat.setVector2("panoOn", onVec);

    // the cloud deck
    camPos.copyFrom(cam.position);
    const f = deckFlashStep(st.deck, dt);
    if (f > 0.45) { st.deck.run++; st.deck.lastRun = st.deck.run; }
    else if (st.deck.run > 0 && f <= 0.45) { st.deck.minRun = st.deck.run; }
    const flashK = Math.max(f, flashIn * 0.6);
    cA.set(Math.max(cover, 0.1), Math.max(storm * 0.8, cover > 0.6 ? (cover - 0.6) * 1.8 : 0), flashK, t);
    // the gap: opens fast under a Sun break, closes slowly; it keeps the direction it was cast in
    const prevGap = st.gap;
    st.gap = gapOpen(st.gap, sun, dt);
    if (prevGap < 0.02 && st.gap >= 0.02) {
      const fw = cam.getForwardRay ? cam.getForwardRay(1).direction : new B.Vector3(0, 0, 1);
      st.hole.set(fw.x, 0, fw.z);
      if (st.hole.lengthSquared() < 1e-4) st.hole.set(0, 0, 1);
      st.hole.normalize();
      st.hole.scaleInPlace(0.8);
      st.hole.y = 0.6;
      st.hole.normalize();
    }
    cB.set(st.gap, st.hole.x, st.hole.y, st.hole.z);
    litVec.set(0, 0, 0);
    let ws = 0;
    PANOS.forEach((id) => { ws += w[id]; litVec.x += LIT[id][0] * w[id]; litVec.y += LIT[id][1] * w[id]; litVec.z += LIT[id][2] * w[id]; });
    if (ws > 0) litVec.scaleInPlace(1 / ws);
    litVec.scaleInPlace(1 + sun * 0.3);
    st.layers.forEach((m) => {
      if (!m.isEnabled()) return;
      m.position.x = camPos.x;
      m.position.z = camPos.z;
      const mat = m.material;
      mat.setVector3("camPos", camPos);
      mat.setVector4("cA", cA);
      mat.setVector4("cB", cB);
      mat.setVector3("lit", litVec);
    });

    // the sun in the gap shows on every quality; the god rays (the post-process) only on high, only while the gap is open
    const showSun = st.gap > 0.03 && sun > 0.02;
    sunDisc.setEnabled(showSun || st.gap > 0.12);
    if (sunDisc.isEnabled()) {
      sunDisc.position.set(camPos.x + st.hole.x * 480, camPos.y + st.hole.y * 480, camPos.z + st.hole.z * 480);
      sunDisc.scaling.setAll(0.5 + st.gap * 0.7);
    }
    const wantRays = st.quality !== "low" && st.gap > 0.04 && sun > 0.02;
    if (wantRays) {
      st.god.closedFor = 0;
      // the ring: centred where the hole's direction meets the deck, its hole as wide as the gap seen from here
      const dist = (DECK_H - camPos.y) / Math.max(0.2, st.hole.y);
      const r = Math.max(8, dist * Math.tan(0.52 * st.gap * 0.8));
      ceiling.position.set(camPos.x + st.hole.x * dist, DECK_H - 1, camPos.z + st.hole.z * dist);
      ceiling.scaling.set(r, 1, r);
      ceiling.setEnabled(true);
      if (!st.god.post) godRaysOn(true);
      if (st.god.post) st.god.post.exposure = 0.18 + 0.2 * st.gap;
    } else {
      st.god.closedFor += dt;
      if (st.god.post && st.god.closedFor > 1.5) { godRaysOn(false); ceiling.setEnabled(false); }
    }

    // the probe follows the camera; the sky it sees changes slowly
    if (st.ibl.probe) {
      st.ibl.probe.position.copyFrom(camPos);
      st.ibl.sinceRefresh += dt;
      if (st.ibl.sinceRefresh > (st.quality === "low" ? 3 : 1) || (f > 0.9 && st.ibl.sinceRefresh > (st.quality === "low" ? 0.9 : 0.25))) {
        st.ibl.sinceRefresh = 0;
        st.ibl.probe.cubeTexture.refreshRate = B.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
        st.ibl.refreshes++;
      }
    }
  });
  return api;
}

const live = window.day && window.day.world && window.day.world();
if (live) installSky(live);
